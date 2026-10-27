// Background monitor: pulls metrics for active campaigns, evaluates rules,
// and (optionally) asks the agent to review performance.
import { db, persist, id, log, withUser, currentUserId } from "./db.js";
import { usersWithActiveCampaigns, pruneSnapshots } from "./store.js";
import { refreshMetrics, perform } from "./actions.js";

export const METRICS = ["spend", "impressions", "clicks", "conversions", "ctr", "cpc", "cpa"];

let timer = null;
const running = new Set(); // user ids with a run in progress

export function createRule({ name, campaignId = null, metric, op, value, action = "alert", minSpend = 0 }) {
  if (!METRICS.includes(metric)) throw new Error(`metric must be one of ${METRICS.join(", ")}`);
  if (![">", "<"].includes(op)) throw new Error("op must be > or <");
  if (!["alert", "pause"].includes(action)) throw new Error("action must be alert or pause");
  if (!Number.isFinite(Number(value))) throw new Error("value must be a number");
  const rule = {
    id: id("rul"),
    name: name || `${metric} ${op} ${value} → ${action}`,
    campaignId: campaignId || null,
    metric,
    op,
    value: Number(value),
    action,
    minSpend: Number(minSpend) || 0,
    enabled: true,
    fired: {}, // campaignId -> date it last fired (one firing per campaign per day)
  };
  db().rules.push(rule);
  log("rule", `Rule created: ${rule.name}`);
  return rule;
}

async function evaluateRules(campaign) {
  const m = campaign.metrics;
  if (!m) return;
  const today = new Date().toISOString().slice(0, 10);
  for (const rule of db().rules) {
    if (!rule.enabled || (rule.campaignId && rule.campaignId !== campaign.id)) continue;
    if (m.spend < rule.minSpend || rule.fired[campaign.id] === today) continue;
    // Ratio metrics are meaningless before there is any denominator.
    if ((rule.metric === "cpa" && !m.conversions) || (rule.metric === "cpc" && !m.clicks) || (rule.metric === "ctr" && !m.impressions))
      continue;
    const v = rule.metric === "ctr" ? m.ctr * 100 : m[rule.metric]; // CTR rules are written in percent
    const hit = rule.op === ">" ? v > rule.value : v < rule.value;
    if (!hit) continue;
    rule.fired[campaign.id] = today;
    const shown = rule.metric === "ctr" ? `${v.toFixed(2)}%` : Number(v.toFixed(2));
    const msg = `Rule "${rule.name}" triggered on "${campaign.name}" (${rule.metric} = ${shown})`;
    if (rule.action === "pause" && campaign.status === "active") {
      await perform("pause", { campaignId: campaign.id }, "monitor", msg);
    } else {
      log("alert", msg, { campaignId: campaign.id });
    }
  }
}

export async function runOnce({ baseUrl } = {}) {
  const userId = currentUserId();
  if (running.has(userId)) return;
  running.add(userId);
  const status = db().monitor;
  // Claim the run first so an overlapping schedule tick skips this user.
  status.lastStartedAt = new Date().toISOString();
  await persist();
  try {
    const active = db().campaigns.filter((x) => x.status === "active");
    // Refresh in small parallel batches: scheduled functions have a 30s limit.
    for (let i = 0; i < active.length; i += 5) {
      await Promise.all(
        active
          .slice(i, i + 5)
          .map((c) => refreshMetrics(c).catch((e) => log("error", `Monitor failed for "${c.name}": ${e.message}`, { campaignId: c.id }))),
      );
    }
    for (const c of active) {
      await evaluateRules(c).catch((e) => log("error", `Rule check failed for "${c.name}": ${e.message}`, { campaignId: c.id }));
    }
    const s = db().settings;
    // AI review costs tokens, so it is opt-in and runs at most hourly.
    if (s.aiReviewEnabled && process.env.ANTHROPIC_API_KEY && Date.now() - status.lastAiReviewAt > 60 * 60 * 1000) {
      status.lastAiReviewAt = Date.now();
      const { runReview } = await import("./agent.js");
      await runReview({ baseUrl }).catch((e) => log("error", `AI review failed: ${e.message}`));
    }
    // Keep 30 days of chart history; prune once a day.
    const today = new Date().toISOString().slice(0, 10);
    if (status.lastPruneDay !== today) {
      await pruneSnapshots(currentUserId(), Date.now() - 30 * 864e5);
      status.lastPruneDay = today;
    }
    status.lastRunAt = new Date().toISOString();
    status.lastError = null;
  } catch (e) {
    status.lastError = e.message;
  } finally {
    await persist();
    running.delete(userId);
  }
}

/** True when the configured interval has elapsed (used by the Netlify scheduled function). */
export function isDue() {
  const { lastRunAt, lastStartedAt } = db().monitor;
  const last = [lastRunAt, lastStartedAt].filter(Boolean).sort().pop();
  const minutes = Math.max(1, Number(db().settings.monitorIntervalMinutes) || 5);
  // 30s slack so a 5-minute cron tick isn't skipped by jitter.
  return !last || Date.now() - new Date(last).getTime() >= minutes * 60000 - 30000;
}

/** Runs the monitor for every user with active campaigns whose interval has elapsed. */
export const MONITOR_BATCH = 50; // users per background run
const PARALLEL_USERS = 5;

/**
 * Runs the monitor for the given users (default: everyone with active
 * campaigns) whose interval has elapsed, a few users at a time.
 */
export async function runAllDue({ baseUrl, users } = {}) {
  const queue = [...(users || (await usersWithActiveCampaigns()))];
  const worker = async () => {
    for (let userId; (userId = queue.shift()); ) {
      await withUser(userId, async () => {
        if (isDue()) await runOnce({ baseUrl });
      }).catch((e) => console.error(`monitor: user ${userId} failed:`, e));
    }
  };
  const total = queue.length;
  await Promise.all(Array.from({ length: Math.min(PARALLEL_USERS, total) }, worker));
  return total;
}

/** Local server only: check every minute which users are due. */
export function start() {
  clearInterval(timer);
  timer = setInterval(() => runAllDue().catch((e) => console.error(e)), 60000);
}
