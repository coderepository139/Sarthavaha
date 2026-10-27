// Persistence backends.
// - "firestore": Cloud Firestore via Firebase Admin (production), in the adpilot_* collections:
//     adpilot_users/{uid}/state/{collection}     small per-user collections (JSON in `data`)
//     adpilot_users/{uid}/conversations/{id}     agent chats (messages JSON in `messages`)
//     adpilot_users/{uid}/snapshots/{auto}       metric history for the spend chart
//     adpilot_accounts/{uid}                     free-campaign counter + Razorpay subscription
//     adpilot_monitor/{uid}                      { active } index of users with live campaigns
//     adpilot_config/{key}                       app-wide settings (e.g. Razorpay plan ids)
//   Values are stored as JSON strings so nested arrays and undefined never trip Firestore's rules.
// - "file": JSON files under data/ for local development without Firebase.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firestore, hasServiceAccount } from "./firebase.js";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "../data"));
export const FREE_CAMPAIGNS = Number(process.env.FREE_CAMPAIGNS || 5);
const ENTITLED_STATUSES = ["active", "authenticated", "pending"];

/** Set by the Netlify function entry points; long jobs then go to background functions. */
export const runtime = { netlify: false };

export const backend =
  hasServiceAccount() || process.env.FIRESTORE_EMULATOR_HOST || process.env.K_SERVICE || process.env.ADPILOT_FIRESTORE === "1"
    ? "firestore"
    : "file";

/** Production deployment (Netlify functions, or NODE_ENV=production): the dev fallbacks are never allowed. */
export const isProduction = () => runtime.netlify || process.env.NODE_ENV === "production";

/** Names (never values) of required environment variables that are not set. */
export const missingConfig = () => {
  const needed = ["APP_SECRET"];
  if (runtime.netlify) needed.unshift("FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY");
  return needed.filter((k) => !process.env[k]);
};

/** Whether an account currently has a paid subscription. */
export const isSubscribed = (a) =>
  ENTITLED_STATUSES.includes(a.subscriptionStatus) && !!a.currentPeriodEnd && new Date(a.currentPeriodEnd) > new Date();

const ACCOUNT_FIELDS = ["email", "plan", "subscriptionStatus", "razorpaySubscriptionId", "currentPeriodEnd"];
const toAccount = (d = {}) => ({
  campaignsCreated: d.campaignsCreated ?? 0,
  plan: d.plan ?? null,
  subscriptionStatus: d.subscriptionStatus ?? "none",
  razorpaySubscriptionId: d.razorpaySubscriptionId ?? null,
  currentPeriodEnd: d.currentPeriodEnd ?? null,
});
const pick = (patch) => Object.fromEntries(Object.entries(patch).filter(([k, v]) => ACCOUNT_FIELDS.includes(k) && v !== undefined));

// ---------- Firestore helpers ----------
const userDoc = (userId) => firestore().collection("adpilot_users").doc(userId);
const accountDoc = (userId) => firestore().collection("adpilot_accounts").doc(userId);
const parse = (json, fallback) => {
  try {
    return json == null ? fallback : JSON.parse(json);
  } catch {
    return fallback;
  }
};

// ---------- file backend helpers ----------
const fileOf = (name) => path.join(DATA_DIR, name);
const readJson = (name, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(fileOf(name), "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (name, value) => {
  fs.mkdirSync(path.dirname(fileOf(name)), { recursive: true });
  const tmp = fileOf(name) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, fileOf(name));
};
const safeId = (userId) => userId.replace(/[^a-zA-Z0-9_-]/g, "");

// ---------- per-user state ----------

/** Returns { collection: data } for every stored collection of the user. */
export async function readState(userId) {
  if (backend === "file") return readJson(`users/${safeId(userId)}.json`, {});
  const snap = await userDoc(userId).collection("state").get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, parse(d.get("data"), null)]));
}

/** Writes the given collections ({ collection: data }) for the user. */
export async function writeState(userId, changes) {
  if (!Object.keys(changes).length) return;
  if (backend === "file") {
    const name = `users/${safeId(userId)}.json`;
    writeJson(name, { ...readJson(name, {}), ...changes });
    return;
  }
  const batch = firestore().batch();
  const updatedAt = Date.now();
  for (const [collection, data] of Object.entries(changes)) {
    batch.set(userDoc(userId).collection("state").doc(collection), { data: JSON.stringify(data), updatedAt });
  }
  // Keep the monitor's index of users with live campaigns in step with the campaigns list.
  if (changes.campaigns) {
    const active = changes.campaigns.some((c) => c.status === "active");
    batch.set(firestore().collection("adpilot_monitor").doc(userId), { active, updatedAt });
  }
  await batch.commit();
}

/** Users that have at least one active campaign (for the monitor). */
export async function usersWithActiveCampaigns() {
  if (backend === "file") {
    const dir = fileOf("users");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .filter((u) => (readJson(`users/${u}.json`, {}).campaigns || []).some((c) => c.status === "active"));
  }
  const snap = await firestore().collection("adpilot_monitor").where("active", "==", true).select().get();
  return snap.docs.map((d) => d.id);
}

// ---------- agent conversations (own documents, loaded one at a time) ----------

// Firestore documents are limited to 1 MiB; refuse well before that.
const MAX_CONVERSATION_BYTES = 900_000;

export async function listConversations(userId, limit = 50) {
  if (backend === "file") {
    const dir = fileOf(`conversations/${safeId(userId)}`);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .map((f) => readJson(`conversations/${safeId(userId)}/${f}`, null))
      .filter(Boolean)
      .map(({ id, title, createdAt }) => ({ id, title, createdAt }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }
  const snap = await userDoc(userId).collection("conversations").orderBy("createdAt", "desc").limit(limit).select("title", "createdAt").get();
  return snap.docs.map((d) => ({ id: d.id, title: d.get("title"), createdAt: d.get("createdAt") }));
}

export async function getConversation(userId, id) {
  if (backend === "file") return readJson(`conversations/${safeId(userId)}/${safeId(id)}.json`, null);
  const d = await userDoc(userId).collection("conversations").doc(id).get();
  if (!d.exists) return null;
  return {
    id: d.id,
    title: d.get("title"),
    messages: parse(d.get("messages"), []),
    running: !!d.get("running"),
    runStartedAt: d.get("runStartedAt") || 0,
    error: d.get("error") || null,
    createdAt: d.get("createdAt"),
  };
}

export async function saveConversation(userId, c) {
  if (backend === "file") return writeJson(`conversations/${safeId(userId)}/${safeId(c.id)}.json`, c);
  const messages = JSON.stringify(c.messages);
  if (messages.length > MAX_CONVERSATION_BYTES) throw new Error("This conversation is too long to save. Start a new conversation.");
  await userDoc(userId)
    .collection("conversations")
    .doc(c.id)
    .set({
      title: c.title,
      messages,
      running: !!c.running,
      runStartedAt: c.runStartedAt || 0,
      error: c.error || null,
      createdAt: c.createdAt,
      updatedAt: Date.now(),
    });
}

export async function deleteConversation(userId, id) {
  if (backend === "file") return fs.rmSync(fileOf(`conversations/${safeId(userId)}/${safeId(id)}.json`), { force: true });
  await userDoc(userId).collection("conversations").doc(id).delete();
}

// ---------- metric snapshots (spend chart history) ----------

export async function addSnapshots(userId, rows) {
  if (!rows.length) return;
  if (backend === "file") {
    const name = `snapshots/${safeId(userId)}.json`;
    return writeJson(name, [...readJson(name, []), ...rows]);
  }
  const col = userDoc(userId).collection("snapshots");
  for (let i = 0; i < rows.length; i += 400) {
    const batch = firestore().batch();
    for (const r of rows.slice(i, i + 400)) {
      batch.set(col.doc(), {
        campaignId: r.campaignId,
        at: r.at,
        spend: r.spend,
        impressions: r.impressions,
        clicks: r.clicks,
        conversions: r.conversions,
      });
    }
    await batch.commit();
  }
}

/** Snapshots since a time (ms), oldest first: [{ campaignId, at (ms), spend }]. */
export async function snapshotsSince(userId, sinceMs) {
  if (backend === "file") return readJson(`snapshots/${safeId(userId)}.json`, []).filter((s) => s.at >= sinceMs);
  const snap = await userDoc(userId)
    .collection("snapshots")
    .where("at", ">=", sinceMs)
    .orderBy("at", "asc")
    .limit(10000)
    .select("campaignId", "at", "spend")
    .get();
  return snap.docs.map((d) => ({ campaignId: d.get("campaignId"), at: d.get("at"), spend: Number(d.get("spend")) }));
}

export async function pruneSnapshots(userId, beforeMs) {
  if (backend === "file") {
    const name = `snapshots/${safeId(userId)}.json`;
    return writeJson(name, readJson(name, []).filter((s) => s.at >= beforeMs));
  }
  const old = userDoc(userId).collection("snapshots").where("at", "<", beforeMs).limit(400);
  for (;;) {
    const snap = await old.get();
    if (snap.empty) return;
    const batch = firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// ---------- billing accounts ----------

export async function getAccount(userId) {
  if (backend === "file") return toAccount(readJson("accounts.json", {})[userId]);
  const d = await accountDoc(userId).get();
  return toAccount(d.exists ? d.data() : {});
}

export async function updateAccount(userId, patch) {
  if (backend === "file") {
    const all = readJson("accounts.json", {});
    all[userId] = { ...all[userId], ...pick(patch) };
    writeJson("accounts.json", all);
    return;
  }
  await accountDoc(userId).set({ ...pick(patch), updatedAt: Date.now() }, { merge: true });
}

export async function findUserBySubscription(subscriptionId) {
  if (backend === "file") {
    const all = readJson("accounts.json", {});
    return Object.keys(all).find((u) => all[u].razorpaySubscriptionId === subscriptionId) || null;
  }
  const snap = await firestore().collection("adpilot_accounts").where("razorpaySubscriptionId", "==", subscriptionId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/** Atomically uses one campaign credit. False when the free limit is used up and there is no subscription. */
export async function consumeCampaignCredit(userId) {
  if (backend === "firestore") {
    return firestore().runTransaction(async (tx) => {
      const d = await tx.get(accountDoc(userId));
      const a = toAccount(d.exists ? d.data() : {});
      if (a.campaignsCreated >= FREE_CAMPAIGNS && !isSubscribed(a)) return false;
      tx.set(accountDoc(userId), { campaignsCreated: a.campaignsCreated + 1, updatedAt: Date.now() }, { merge: true });
      return true;
    });
  }
  const all = readJson("accounts.json", {});
  const a = toAccount(all[userId]);
  if (a.campaignsCreated >= FREE_CAMPAIGNS && !isSubscribed(a)) return false;
  all[userId] = { ...all[userId], campaignsCreated: a.campaignsCreated + 1 };
  writeJson("accounts.json", all);
  return true;
}

export async function refundCampaignCredit(userId) {
  if (backend === "firestore") {
    await firestore().runTransaction(async (tx) => {
      const d = await tx.get(accountDoc(userId));
      const n = toAccount(d.exists ? d.data() : {}).campaignsCreated;
      tx.set(accountDoc(userId), { campaignsCreated: Math.max(0, n - 1), updatedAt: Date.now() }, { merge: true });
    });
    return;
  }
  const all = readJson("accounts.json", {});
  all[userId] = { ...all[userId], campaignsCreated: Math.max(0, (all[userId]?.campaignsCreated || 0) - 1) };
  writeJson("accounts.json", all);
}

// ---------- app config ----------

export async function getConfig(key) {
  if (backend === "file") return readJson("config.json", {})[key] ?? null;
  const d = await firestore().collection("adpilot_config").doc(key).get();
  return d.exists ? parse(d.get("value"), null) : null;
}

export async function setConfig(key, value) {
  if (backend === "file") {
    writeJson("config.json", { ...readJson("config.json", {}), [key]: value });
    return;
  }
  await firestore().collection("adpilot_config").doc(key).set({ value: JSON.stringify(value), updatedAt: Date.now() });
}
