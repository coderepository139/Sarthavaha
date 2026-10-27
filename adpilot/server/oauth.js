// "Connect with Meta / Google Ads / TikTok": OAuth instead of pasted API keys.
//
// 1. start():    the signed-in user gets the platform's consent URL. `state` is signed and carries
//                the user id plus a single-use nonce saved in their data (CSRF protection).
// 2. callback(): the platform redirects back with a code; we exchange it for a token, list the
//                ad accounts it can reach, and keep them (encrypted) as a pending choice for 15 min.
// 3. finish():   the user picks which ad accounts to connect; each becomes a connection.
//
// App credentials (client ids/secrets, Google developer token) are server settings, never user input.
import crypto from "node:crypto";
import { db, id, log, currentUserId } from "./db.js";
import { encrypt, decrypt, sign } from "./crypto.js";
import { request, PlatformError } from "./platforms/http.js";
import { META_GRAPH, META_VERSION, proof } from "./platforms/meta.js";
import { googleApp, GOOGLE_TOKEN_URL, GOOGLE_ADS_API, GOOGLE_ADS_VERSION } from "./platforms/google.js";
import { TIKTOK_API } from "./platforms/tiktok.js";
import { addConnection, ActionError } from "./actions.js";

export const CONSOLE_PATH = "/console/";
const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;
const MAX_ACCOUNTS = 50;

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")).toString();

// ---------- providers ----------

const PROVIDERS = {
  meta: {
    label: "Meta",
    configured: () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    authorizeUrl: (redirectUri, state) =>
      `https://www.facebook.com/${META_VERSION}/dialog/oauth?` +
      qs({
        client_id: process.env.META_APP_ID,
        redirect_uri: redirectUri,
        state,
        response_type: "code",
        scope: "ads_management,ads_read,business_management",
      }),
    async exchange({ code }, redirectUri) {
      const app = { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET };
      const short = await request("meta", `${META_GRAPH}/${META_VERSION}/oauth/access_token?${qs({ ...app, redirect_uri: redirectUri, code })}`);
      // Swap the 1-2 hour token for a long-lived one (about 60 days).
      const long = await request(
        "meta",
        `${META_GRAPH}/${META_VERSION}/oauth/access_token?${qs({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`,
      );
      const token = long.access_token;
      const accounts = await request(
        "meta",
        `${META_GRAPH}/${META_VERSION}/me/adaccounts?${qs({ fields: "account_id,name,currency,account_status", limit: 200, access_token: token, appsecret_proof: proof(token) })}`,
      );
      return {
        secret: { accessToken: token },
        tokenExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
        accounts: (accounts.data || []).map((a) => ({ id: a.id, name: a.name || a.account_id, currency: a.currency })),
      };
    },
    credentials: (secret, account) => ({ accessToken: secret.accessToken, adAccountId: account.id }),
  },

  google: {
    label: "Google Ads",
    configured: () => {
      const a = googleApp();
      return !!(a.clientId && a.clientSecret && a.developerToken);
    },
    authorizeUrl: (redirectUri, state) =>
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      qs({
        client_id: googleApp().clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/adwords",
        access_type: "offline", // we need a refresh token for background monitoring
        prompt: "consent", // always return a refresh token, even on reconnect
        include_granted_scopes: "true",
        state,
      }),
    async exchange({ code }, redirectUri) {
      const app = googleApp();
      const t = await request("google", GOOGLE_TOKEN_URL, {
        method: "POST",
        form: { code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" },
      });
      if (!t.refresh_token) {
        throw new PlatformError("google", "Google didn't grant offline access. Remove the app at myaccount.google.com/permissions and connect again.");
      }
      return { secret: { refreshToken: t.refresh_token }, tokenExpiresAt: null, accounts: await googleAccounts(t.access_token) };
    },
    credentials: (secret, account) => ({
      refreshToken: secret.refreshToken,
      customerId: account.id,
      ...(account.loginCustomerId && { loginCustomerId: account.loginCustomerId }),
    }),
  },

  tiktok: {
    label: "TikTok",
    configured: () => !!(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET),
    authorizeUrl: (redirectUri, state) =>
      "https://business-api.tiktok.com/portal/auth?" + qs({ app_id: process.env.TIKTOK_APP_ID, state, redirect_uri: redirectUri }),
    async exchange({ auth_code: authCode, code }) {
      const r = await request("tiktok", `${TIKTOK_API}/open_api/v1.3/oauth2/access_token/`, {
        method: "POST",
        body: { app_id: process.env.TIKTOK_APP_ID, secret: process.env.TIKTOK_APP_SECRET, auth_code: authCode || code },
      });
      if (r.code !== 0) throw new PlatformError("tiktok", r.message || `code ${r.code}`);
      const token = r.data.access_token;
      const ids = (r.data.advertiser_ids || []).map(String).slice(0, MAX_ACCOUNTS);
      let names = {};
      if (ids.length) {
        const info = await request("tiktok", `${TIKTOK_API}/open_api/v1.3/advertiser/info/?${qs({ advertiser_ids: JSON.stringify(ids) })}`, {
          headers: { "Access-Token": token },
        }).catch(() => null);
        names = Object.fromEntries((info?.data?.list || []).map((a) => [String(a.advertiser_id), a]));
      }
      return {
        secret: { accessToken: token },
        tokenExpiresAt: null,
        accounts: ids.map((i) => ({ id: i, name: names[i]?.name || `Advertiser ${i}`, currency: names[i]?.currency })),
      };
    },
    credentials: (secret, account) => ({ accessToken: secret.accessToken, advertiserId: account.id }),
  },
};

/** Google Ads accounts reachable with this token; client accounts under a manager (MCC) are expanded. */
async function googleAccounts(accessToken) {
  const app = googleApp();
  const headers = (loginCustomerId) => ({
    Authorization: `Bearer ${accessToken}`,
    "developer-token": app.developerToken,
    ...(loginCustomerId && { "login-customer-id": loginCustomerId }),
  });
  const search = (customerId, query, loginCustomerId) =>
    request("google", `${GOOGLE_ADS_API}/${GOOGLE_ADS_VERSION}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: headers(loginCustomerId),
      body: { query },
    }).then((r) => r.results || []);

  const list = await request("google", `${GOOGLE_ADS_API}/${GOOGLE_ADS_VERSION}/customers:listAccessibleCustomers`, { headers: headers() });
  const ids = (list.resourceNames || []).map((r) => r.split("/").pop()).slice(0, 25);
  const found = new Map();
  await Promise.all(
    ids.map(async (cid) => {
      const [row] = await search(cid, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1").catch(
        () => [],
      );
      const c = row?.customer;
      if (!c?.manager) {
        found.set(cid, { id: cid, name: c?.descriptiveName || `Customer ${cid}`, currency: c?.currencyCode });
        return;
      }
      // A manager account can't run campaigns itself; offer the accounts it manages.
      const clients = await search(
        cid,
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager FROM customer_client WHERE customer_client.level = 1",
        cid,
      ).catch(() => []);
      for (const { customerClient: cc } of clients) {
        if (cc && !cc.manager && !found.has(String(cc.id))) {
          found.set(String(cc.id), { id: String(cc.id), name: cc.descriptiveName || `Customer ${cc.id}`, currency: cc.currencyCode, loginCustomerId: cid });
        }
      }
    }),
  );
  return [...found.values()].slice(0, MAX_ACCOUNTS);
}

export const providerStatus = () => Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.configured()]));

function provider(platform) {
  const p = PROVIDERS[platform];
  if (!p) throw new ActionError(`Unknown platform: ${platform}`);
  if (!p.configured()) throw new ActionError(`${p.label} sign-in isn't set up on the server yet.`);
  return p;
}

// ---------- state (CSRF) ----------

const b64 = (s) => Buffer.from(s).toString("base64url");

function makeState(userId, platform, nonce) {
  const payload = b64(JSON.stringify({ u: userId, p: platform, n: nonce, e: Date.now() + STATE_TTL_MS }));
  return `${payload}.${sign(`oauth:${payload}`)}`;
}

/** Verifies the signature and expiry of a `state` value; returns { userId, platform, nonce } or null. */
export function readState(state) {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(`oauth:${payload}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!(s.e > Date.now())) return null;
    return { userId: s.u, platform: s.p, nonce: s.n };
  } catch {
    return null;
  }
}

// ---------- flow (each runs inside withUser for the right user) ----------

/** Step 1: the consent URL to send the browser to. */
export function start(platform, redirectUri) {
  const p = provider(platform);
  const nonce = crypto.randomBytes(16).toString("hex");
  db().oauth = { ...db().oauth, nonce };
  return { url: p.authorizeUrl(redirectUri, makeState(currentUserId(), platform, nonce)) };
}

/**
 * Step 2: handle the platform's redirect. Returns the console URL to send the browser to.
 * `state` was already verified by the caller (which needed the user id to load their data).
 */
export async function callback(platform, query, state, redirectUri) {
  const back = (params) => `${CONSOLE_PATH}?${qs(params)}#connections`;
  const saved = db().oauth || {};
  if (!saved.nonce || saved.nonce !== state.nonce || state.platform !== platform) {
    return back({ oauth_error: "This sign-in link expired. Please click Connect again." });
  }
  db().oauth = { ...saved, nonce: null }; // single use
  if (query.error || query.error_reason) {
    const denied = /denied|access_denied/i.test(`${query.error} ${query.error_reason}`);
    return back({ oauth_error: denied ? "Permission was not granted." : String(query.error_description || query.error || "Sign-in failed") });
  }
  try {
    const p = provider(platform);
    const r = await p.exchange(query, redirectUri);
    if (!r.accounts.length) return back({ oauth_error: `No ${p.label} ad accounts were found for this login.` });
    db().oauth = {
      nonce: null,
      pending: {
        id: id("oap"),
        platform,
        secret: encrypt(r.secret),
        tokenExpiresAt: r.tokenExpiresAt,
        accounts: r.accounts,
        expiresAt: Date.now() + PENDING_TTL_MS,
      },
    };
    return back({ oauth: platform });
  } catch (e) {
    log("error", `${PROVIDERS[platform]?.label || platform} sign-in failed: ${e.message}`);
    return back({ oauth_error: `Couldn't finish connecting: ${e.message}` });
  }
}

const livePending = () => {
  const p = db().oauth?.pending;
  return p && p.expiresAt > Date.now() ? p : null;
};

/** Accounts waiting to be chosen after a successful sign-in (no tokens included). */
export function pending() {
  const p = livePending();
  return p ? { platform: p.platform, label: PROVIDERS[p.platform].label, accounts: p.accounts } : null;
}

/** Step 3: connect the chosen ad accounts. */
export async function finish(accountIds = []) {
  const p = livePending();
  if (!p) throw new ActionError("That sign-in has expired. Please click Connect again.");
  const chosen = p.accounts.filter((a) => accountIds.includes(a.id));
  if (!chosen.length) throw new ActionError("Choose at least one ad account.");
  const prov = PROVIDERS[p.platform];
  const secret = decrypt(p.secret);
  const connected = [];
  const failed = [];
  for (const account of chosen) {
    try {
      connected.push(
        await addConnection({
          platform: p.platform,
          name: `${prov.label} · ${account.name}`,
          credentials: prov.credentials(secret, account),
          tokenExpiresAt: p.tokenExpiresAt,
        }),
      );
    } catch (e) {
      failed.push({ account: account.name, error: e.message });
    }
  }
  db().oauth = { nonce: null, pending: null };
  return { connected, failed };
}

export function cancel() {
  db().oauth = { nonce: null, pending: null };
}
