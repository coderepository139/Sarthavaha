// Per-user state for the current request/job. Each request runs inside
// withUser(), which loads that user's small collections into an
// AsyncLocalStorage context; db() returns them and persist() writes back only
// what changed. Large data (agent conversations, metric history) lives in its
// own tables and is read on demand through store.js.
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readState, writeState, addSnapshots } from "./store.js";

const DEFAULTS = {
  connections: [], // { id, platform, name, credentials (encrypted), accountInfo, createdAt }
  campaigns: [], // { id, connectionId, platform, externalId, name, objective, dailyBudget, status, ... }
  rules: [], // { id, name, campaignId|null, metric, op, value, action, enabled }
  approvals: [], // { id, action, params, reason, status, requestedBy, createdAt, decidedAt, result }
  activity: [], // { id, at, type, message, campaignId? }
  sandbox: {}, // simulated platform state, keyed by connection id
  oauth: { nonce: null, pending: null }, // in-progress "Connect with ..." sign-in (see oauth.js)
  usage: { day: null, agentMessages: 0, month: null, aiCostUsd: 0 },
  monitor: { lastRunAt: null, lastError: null, lastAiReviewAt: 0 },
  settings: {
    autopilot: false, // when false, launches and budget increases wait for human approval
    maxCampaignDailyBudget: 5000,
    maxTotalDailyBudget: 20000,
    monitorIntervalMinutes: 15,
    aiReviewEnabled: false,
  },
};
const COLLECTIONS = Object.keys(DEFAULTS);

const als = new AsyncLocalStorage();

function ctx() {
  const c = als.getStore();
  if (!c) throw new Error("No user context");
  return c;
}

export const currentUserId = () => ctx().userId;

/** Loads the user's state and runs fn with it as the current context. */
export async function withUser(userId, fn) {
  const c = { userId, state: null, loadedJson: {}, snapshots: [], cache: new Map() };
  return als.run(c, async () => {
    await load();
    return fn();
  });
}

/** (Re)reads the current user's state, e.g. to pick up writes from other invocations. */
export async function load() {
  const c = ctx();
  const saved = await readState(c.userId);
  const s = {};
  for (const k of COLLECTIONS) {
    const d = DEFAULTS[k];
    s[k] = saved[k] == null ? structuredClone(d) : Array.isArray(d) ? saved[k] : { ...structuredClone(d), ...saved[k] };
  }
  c.state = s;
  c.loadedJson = Object.fromEntries(COLLECTIONS.map((k) => [k, saved[k] == null ? null : JSON.stringify(saved[k])]));
  return s;
}

export const db = () => ctx().state;

/** Caches fn() for the rest of this request/job (outside a request it just calls fn). */
export function memo(key, fn) {
  const c = als.getStore();
  if (!c) return fn();
  if (!c.cache.has(key)) c.cache.set(key, Promise.resolve().then(fn));
  return c.cache.get(key);
}
export const forget = (key) => als.getStore()?.cache.delete(key);

/** Seeds the request cache with a lookup that was started early (e.g. in parallel with loading state). */
export const prime = (key, promise) => {
  promise.catch(() => {}); // the awaiting caller handles errors
  als.getStore()?.cache.set(key, promise);
};

/** Buffers a metric snapshot; written by persist(). */
export const queueSnapshot = (row) => ctx().snapshots.push(row);

/** Writes the collections that changed since load(). Await at the end of every request/job. */
export async function persist() {
  const c = ctx();
  const changes = {};
  for (const k of COLLECTIONS) {
    const json = JSON.stringify(c.state[k]);
    if (json !== c.loadedJson[k]) changes[k] = c.state[k];
  }
  const snapshots = c.snapshots.splice(0);
  await Promise.all([writeState(c.userId, changes), addSnapshots(c.userId, snapshots)]);
  for (const k in changes) c.loadedJson[k] = JSON.stringify(changes[k]);
}

export const id = (prefix) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;

export function log(type, message, extra = {}) {
  const entry = { id: id("act"), at: new Date().toISOString(), type, message, ...extra };
  db().activity.unshift(entry);
  db().activity.length = Math.min(db().activity.length, 200);
  return entry;
}
