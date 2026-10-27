// The single action layer used by the REST API, the AI agent and the monitor.
// Guardrails (budget caps) are enforced here for every caller; approvals apply
// to spend-increasing actions requested by the agent when autopilot is off.
import { db, id, log, currentUserId, queueSnapshot } from "./db.js";
import { consumeCampaignCredit, refundCampaignCredit, FREE_CAMPAIGNS } from "./store.js";
import { encrypt, decrypt } from "./crypto.js";
import { getPlatform } from "./platforms/index.js";

const OBJECTIVES = ["traffic", "awareness", "engagement", "leads", "sales", "app_installs"];

export class ActionError extends Error {
  status = 400;
}
/** Thrown when a free user has used all their free campaigns (HTTP 402 Payment Required). */
export class QuotaError extends ActionError {
  status = 402;
}

const findConnection = (cid) => {
  const c = db().connections.find((x) => x.id === cid);
  if (!c) throw new ActionError(`Connection ${cid} not found`);
  return c;
};
export const findCampaign = (cid) => {
  const c = db().campaigns.find((x) => x.id === cid);
  if (!c) throw new ActionError(`Campaign ${cid} not found`);
  return c;
};
const ctx = (conn) => ({ creds: decrypt(conn.credentials), connectionId: conn.id });

// The ad account a connection points at; tokens themselves never leave the server.
const accountIdOf = (creds) => creds.adAccountId || creds.customerId || creds.advertiserId || null;

export const publicConnection = (c) => ({
  id: c.id,
  platform: c.platform,
  name: c.name,
  accountInfo: c.accountInfo,
  accountId: c.accountId ?? null,
  tokenExpiresAt: c.tokenExpiresAt ?? null,
  createdAt: c.createdAt,
});

// ---------- connections ----------

/**
 * Adds a connection with credentials the server obtained itself: OAuth tokens from
 * "Connect with ..." (oauth.js), or nothing for the Sandbox. Users never paste API keys.
 * Reconnecting the same ad account refreshes its token and keeps the connection (and campaigns).
 */
export async function addConnection({ platform, name, credentials = {}, tokenExpiresAt = null }) {
  const p = getPlatform(platform);
  const accountId = accountIdOf(credentials);
  const existing = accountId && db().connections.find((c) => c.platform === platform && c.accountId === accountId);
  const conn = existing || { id: id("con"), platform, name: name || p.label, accountId, createdAt: new Date().toISOString() };
  conn.credentials = encrypt(credentials);
  conn.tokenExpiresAt = tokenExpiresAt;
  conn.accountInfo = await p.validate(ctx(conn)); // throws if the token doesn't work for this account
  if (!existing) db().connections.push(conn);
  log("connection", `${existing ? "Reconnected" : "Connected"} ${p.label}: ${conn.accountInfo.accountName || conn.name}`);
  return publicConnection(conn);
}

export async function testConnection(connectionId) {
  const conn = findConnection(connectionId);
  conn.accountInfo = await getPlatform(conn.platform).validate(ctx(conn));
  return conn.accountInfo;
}

export function removeConnection(connectionId) {
  const conn = findConnection(connectionId);
  const d = db();
  d.connections = d.connections.filter((c) => c.id !== connectionId);
  d.campaigns = d.campaigns.filter((c) => c.connectionId !== connectionId);
  delete d.sandbox[connectionId];
  log("connection", `Removed connection ${conn.name}`);
}

export async function importCampaigns(connectionId) {
  const conn = findConnection(connectionId);
  const remote = await getPlatform(conn.platform).listCampaigns(ctx(conn));
  let added = 0;
  for (const r of remote) {
    const existing = db().campaigns.find((c) => c.connectionId === conn.id && c.externalId === r.externalId);
    if (existing) {
      Object.assign(existing, { name: r.name, status: r.status, dailyBudget: r.dailyBudget ?? existing.dailyBudget });
    } else {
      db().campaigns.push(newCampaignRecord(conn, { ...r, objective: "unknown" }));
      added++;
    }
  }
  log("sync", `Synced ${remote.length} campaigns from ${conn.name} (${added} new)`);
  return { total: remote.length, added };
}

function newCampaignRecord(conn, r) {
  return {
    id: id("cmp"),
    connectionId: conn.id,
    platform: conn.platform,
    externalId: r.externalId,
    name: r.name,
    objective: r.objective,
    dailyBudget: r.dailyBudget,
    status: r.status || "paused",
    countries: r.countries || [],
    metrics: null,
    createdAt: new Date().toISOString(),
  };
}

// ---------- guardrails ----------

function checkBudget(dailyBudget, campaignId, { activating = false } = {}) {
  const s = db().settings;
  if (!(dailyBudget > 0)) throw new ActionError("Daily budget must be a positive number");
  if (dailyBudget > s.maxCampaignDailyBudget) {
    throw new ActionError(`Daily budget ${dailyBudget} exceeds the per-campaign cap of ${s.maxCampaignDailyBudget}`);
  }
  const others = db()
    .campaigns.filter((c) => c.status === "active" && c.id !== campaignId)
    .reduce((sum, c) => sum + (c.dailyBudget || 0), 0);
  const self = db().campaigns.find((c) => c.id === campaignId);
  if ((activating || self?.status === "active") && others + dailyBudget > s.maxTotalDailyBudget) {
    throw new ActionError(`Total active daily budget would be ${others + dailyBudget}, over the account cap of ${s.maxTotalDailyBudget}`);
  }
}

// ---------- campaign actions ----------

export async function createCampaign(params, actor = "user") {
  const { connectionId, name, objective = "traffic", dailyBudget, countries = [], ageMin, ageMax } = params;
  if (!name) throw new ActionError("Campaign name is required");
  if (!OBJECTIVES.includes(objective)) throw new ActionError(`Objective must be one of ${OBJECTIVES.join(", ")}`);
  const budget = Number(dailyBudget);
  checkBudget(budget, null);
  const conn = findConnection(connectionId);
  const spec = { name, objective, dailyBudget: budget, countries, ageMin, ageMax };
  // Sandbox campaigns are free practice; real-platform campaigns use one of the free credits.
  const metered = conn.platform !== "sandbox";
  if (metered && !(await consumeCampaignCredit(currentUserId()))) {
    throw new QuotaError(
      `You've used your ${FREE_CAMPAIGNS} free campaigns. Subscribe on the Billing page (₹999/month or ₹11,988/year) to create more.`,
    );
  }
  let res;
  try {
    res = await getPlatform(conn.platform).createCampaign(ctx(conn), spec);
  } catch (e) {
    if (metered) await refundCampaignCredit(currentUserId());
    throw e;
  }
  const campaign = newCampaignRecord(conn, { ...spec, externalId: res.externalId, status: "paused" });
  campaign.extra = res.extra;
  db().campaigns.push(campaign);
  log("create", `${actor} created campaign "${name}" on ${conn.name} (paused, ${budget}/day)${res.warning ? ` — ${res.warning}` : ""}`, {
    campaignId: campaign.id,
  });
  return { campaign, warning: res.warning };
}

async function doLaunch({ campaignId }, actor) {
  const c = findCampaign(campaignId);
  checkBudget(c.dailyBudget, c.id, { activating: true });
  const conn = findConnection(c.connectionId);
  await getPlatform(conn.platform).setStatus(ctx(conn), c.externalId, "active");
  c.status = "active";
  log("launch", `${actor} launched "${c.name}"`, { campaignId: c.id });
  return c;
}

async function doPause({ campaignId }, actor, reason) {
  const c = findCampaign(campaignId);
  const conn = findConnection(c.connectionId);
  await getPlatform(conn.platform).setStatus(ctx(conn), c.externalId, "paused");
  c.status = "paused";
  log("pause", `${actor} paused "${c.name}"${reason ? `: ${reason}` : ""}`, { campaignId: c.id });
  return c;
}

async function doBudget({ campaignId, dailyBudget }, actor) {
  const c = findCampaign(campaignId);
  const budget = Number(dailyBudget);
  checkBudget(budget, c.id);
  const conn = findConnection(c.connectionId);
  await getPlatform(conn.platform).updateBudget(ctx(conn), c.externalId, budget);
  const old = c.dailyBudget;
  c.dailyBudget = budget;
  log("budget", `${actor} changed "${c.name}" budget ${old} → ${budget}/day`, { campaignId: c.id });
  return c;
}

const EXECUTORS = { launch: doLaunch, pause: doPause, update_budget: doBudget };

function needsApproval(action, params, actor) {
  if (actor === "user" || db().settings.autopilot) return false;
  if (action === "launch") return true;
  if (action === "update_budget") return Number(params.dailyBudget) > (findCampaign(params.campaignId).dailyBudget || 0);
  return false; // pausing always reduces spend, so it never waits
}

/** Run an action now, or queue it for human approval. */
export async function perform(action, params, actor = "user", reason = "") {
  const exec = EXECUTORS[action];
  if (!exec) throw new ActionError(`Unknown action ${action}`);
  const campaign = findCampaign(params.campaignId);
  if (needsApproval(action, params, actor)) {
    // Validate guardrails up front so we don't queue something that can never run.
    if (action === "launch") checkBudget(campaign.dailyBudget, campaign.id, { activating: true });
    if (action === "update_budget") checkBudget(Number(params.dailyBudget), campaign.id);
    const approval = {
      id: id("apr"),
      action,
      params,
      reason,
      campaignName: campaign.name,
      requestedBy: actor,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    db().approvals.unshift(approval);
    db().approvals.length = Math.min(db().approvals.length, 200);
    log("approval", `${actor} requested approval to ${action.replace("_", " ")} "${campaign.name}"${reason ? `: ${reason}` : ""}`, {
      campaignId: campaign.id,
    });
    return { status: "pending_approval", approvalId: approval.id };
  }
  const result = await exec(params, actor, reason);
  return { status: "done", campaign: result };
}

export async function decideApproval(approvalId, approve) {
  const a = db().approvals.find((x) => x.id === approvalId);
  if (!a) throw new ActionError("Approval not found");
  if (a.status !== "pending") throw new ActionError(`Approval already ${a.status}`);
  a.decidedAt = new Date().toISOString();
  if (!approve) {
    a.status = "rejected";
    log("approval", `Rejected: ${a.action.replace("_", " ")} "${a.campaignName}"`);
    return a;
  }
  try {
    await EXECUTORS[a.action](a.params, "user (approved agent request)");
    a.status = "approved";
  } catch (e) {
    a.status = "failed";
    a.error = e.message;
    log("error", `Approved action failed: ${e.message}`);
  }
  return a;
}

// ---------- metrics ----------

export async function refreshMetrics(campaign, range = "today") {
  const conn = findConnection(campaign.connectionId);
  const m = await getPlatform(conn.platform).getMetrics(ctx(conn), campaign.externalId, range);
  const derived = {
    ...m,
    ctr: m.impressions ? m.clicks / m.impressions : 0,
    cpc: m.clicks ? m.spend / m.clicks : 0,
    cpa: m.conversions ? m.spend / m.conversions : 0,
  };
  if (range === "today") {
    campaign.metrics = { ...derived, updatedAt: new Date().toISOString() };
    queueSnapshot({ campaignId: campaign.id, at: Date.now(), spend: m.spend, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions });
  }
  return derived;
}
