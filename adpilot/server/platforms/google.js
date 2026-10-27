// Google Ads API (REST) adapter.
// Docs: https://developers.google.com/google-ads/api/rest/overview
import { request, round2, PlatformError } from "./http.js";

// The OAuth client and developer token belong to the app (server settings); each connection only
// stores the user's refresh token and customer ID, obtained through "Connect with Google Ads".
export const googleApp = () => ({
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
});
export const GOOGLE_TOKEN_URL = process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";
export const GOOGLE_ADS_API = process.env.GOOGLE_ADS_API_BASE || "https://googleads.googleapis.com";
export const GOOGLE_ADS_VERSION = "v21";

const tokenCache = new Map(); // refreshToken -> { token, exp }

export async function accessToken({ refreshToken }) {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const { clientId, clientSecret } = googleApp();
  const r = await request("google", GOOGLE_TOKEN_URL, {
    method: "POST",
    form: { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" },
  });
  tokenCache.set(refreshToken, { token: r.access_token, exp: Date.now() + r.expires_in * 1000 });
  return r.access_token;
}

const cid = (c) => c.customerId.replace(/-/g, "");

async function call(c, pathname, body) {
  const app = googleApp();
  const headers = { Authorization: `Bearer ${await accessToken(c)}`, "developer-token": app.developerToken };
  const loginCustomerId = c.loginCustomerId || app.loginCustomerId;
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  const url = `${GOOGLE_ADS_API}/${GOOGLE_ADS_VERSION}/customers/${cid(c)}/${pathname}`;
  return request("google", url, { method: "POST", headers, body });
}

const search = async (c, query) => (await call(c, "googleAds:search", { query })).results || [];
const campaignResource = (c, id) => `customers/${cid(c)}/campaigns/${id}`;

const CHANNEL = { traffic: "SEARCH", leads: "SEARCH", sales: "SEARCH", awareness: "DISPLAY", engagement: "DISPLAY", app_installs: "SEARCH" };

export default {
  id: "google",
  label: "Google Ads",
  oauth: true, // connected with "Connect with Google Ads" (see oauth.js), never with pasted keys

  async validate({ creds }) {
    const [row] = await search(creds, "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1");
    return { accountName: row?.customer?.descriptiveName, currency: row?.customer?.currencyCode };
  },

  async createCampaign({ creds }, spec) {
    const budget = await call(creds, "campaignBudgets:mutate", {
      operations: [
        {
          create: {
            name: `${spec.name} budget ${Date.now()}`,
            amountMicros: String(Math.round(spec.dailyBudget * 1e6)),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      ],
    });
    const channel = CHANNEL[spec.objective] || "SEARCH";
    const campaign = await call(creds, "campaigns:mutate", {
      operations: [
        {
          create: {
            name: spec.name,
            status: "PAUSED",
            advertisingChannelType: channel,
            campaignBudget: budget.results[0].resourceName,
            manualCpc: {},
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            ...(channel === "SEARCH" && {
              networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false },
            }),
          },
        },
      ],
    });
    const externalId = campaign.results[0].resourceName.split("/").pop();
    return { externalId, warning: "Add ad groups, keywords and ads in Google Ads before launching." };
  },

  async setStatus({ creds }, externalId, status) {
    await call(creds, "campaigns:mutate", {
      operations: [
        { update: { resourceName: campaignResource(creds, externalId), status: status === "active" ? "ENABLED" : "PAUSED" }, updateMask: "status" },
      ],
    });
  },

  async updateBudget({ creds }, externalId, dailyBudget) {
    const [row] = await search(creds, `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${Number(externalId)}`);
    if (!row) throw new PlatformError("google", `Campaign ${externalId} not found`);
    await call(creds, "campaignBudgets:mutate", {
      operations: [
        { update: { resourceName: row.campaign.campaignBudget, amountMicros: String(Math.round(dailyBudget * 1e6)) }, updateMask: "amount_micros" },
      ],
    });
  },

  async getMetrics({ creds }, externalId, range = "today") {
    const during = range === "today" ? "TODAY" : "LAST_7_DAYS";
    const rows = await search(
      creds,
      `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE campaign.id = ${Number(externalId)} AND segments.date DURING ${during}`,
    );
    const sum = (f) => rows.reduce((s, r) => s + Number(r.metrics?.[f] || 0), 0);
    return { spend: round2(sum("costMicros") / 1e6), impressions: sum("impressions"), clicks: sum("clicks"), conversions: round2(sum("conversions")) };
  },

  async listCampaigns({ creds }) {
    const rows = await search(
      creds,
      "SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'",
    );
    return rows.map((r) => ({
      externalId: String(r.campaign.id),
      name: r.campaign.name,
      status: r.campaign.status === "ENABLED" ? "active" : "paused",
      dailyBudget: r.campaignBudget?.amountMicros ? Number(r.campaignBudget.amountMicros) / 1e6 : null,
    }));
  },
};
