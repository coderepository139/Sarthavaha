// The AdPilot agent: Claude with tools over the action layer.
import Anthropic from "@anthropic-ai/sdk";
import { db, persist, load, withUser, currentUserId, id, log } from "./db.js";
import { runtime, getConversation, saveConversation } from "./store.js";
import { summary as billingSummary } from "./billing.js";
import { sign } from "./crypto.js";
import { platforms } from "./platforms/index.js";
import * as actions from "./actions.js";
import { createRule, METRICS } from "./monitor.js";

const MODEL = process.env.ADPILOT_MODEL || "claude-opus-5-5";
const MAX_STEPS = 12; // model calls per turn
const MAX_HISTORY = 120; // messages per conversation; longer chats get expensive to resend

// AI spend limits per user (USD). Each turn re-sends the conversation, so cost grows with length.
const LIMITS = {
  free: { dailyMessages: Number(process.env.AGENT_DAILY_LIMIT_FREE || 5), monthlyUsd: Number(process.env.AI_MONTHLY_BUDGET_USD_FREE || 0.5) },
  paid: { dailyMessages: Number(process.env.AGENT_DAILY_LIMIT_PAID || 100), monthlyUsd: Number(process.env.AI_MONTHLY_BUDGET_USD_PAID || 5) },
};

// USD per million tokens. Cache writes bill at 1.25x input.
const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

function costOf(usage = {}) {
  const p = PRICES[MODEL] || PRICES["claude-opus-5-5"];
  return (
    ((usage.input_tokens || 0) * p.input +
      (usage.cache_creation_input_tokens || 0) * p.input * 1.25 +
      (usage.cache_read_input_tokens || 0) * p.cacheRead +
      (usage.output_tokens || 0) * p.output) /
    1e6
  );
}

/** Resets the daily/monthly counters when the day or month rolls over. */
function usage() {
  const u = db().usage;
  const today = new Date().toISOString().slice(0, 10);
  if (u.day !== today) Object.assign(u, { day: today, agentMessages: 0 });
  if (u.month !== today.slice(0, 7)) Object.assign(u, { month: today.slice(0, 7), aiCostUsd: 0 });
  return u;
}

/** Today's and this month's AI usage against the user's limits. */
export async function allowance() {
  const tier = (await billingSummary(currentUserId())).subscribed ? "paid" : "free";
  const u = usage();
  const l = LIMITS[tier];
  return {
    tier,
    messagesToday: u.agentMessages,
    dailyMessages: l.dailyMessages,
    costUsd: Math.round(u.aiCostUsd * 1000) / 1000,
    monthlyUsd: l.monthlyUsd,
    blocked:
      u.aiCostUsd >= l.monthlyUsd
        ? `You've used this month's AI agent allowance. It resets on the 1st${tier === "free" ? ", or subscribe for a larger allowance" : ""}.`
        : u.agentMessages >= l.dailyMessages
          ? `Daily AI agent limit reached (${l.dailyMessages} messages). It resets at midnight UTC${tier === "free" ? ", or subscribe for more" : ""}.`
          : null,
  };
}
let client;
const anthropic = () => (client ||= new Anthropic());

const SYSTEM = `You are AdPilot, an autonomous performance-marketing agent. You plan, create, launch and monitor paid ad campaigns on the user's connected ad platforms (Meta, Google Ads, TikTok, or the Sandbox simulator) using the tools provided.

How you work:
- Start by checking connections and existing campaigns when the request depends on them. Never invent IDs; use the IDs the tools return.
- When the user gives a brief, turn it into a concrete plan (platform, objective, daily budget, geo, audience) and execute it. Fill gaps with sensible defaults and say which defaults you chose.
- New campaigns are always created paused. Launching and budget increases may come back as "pending_approval" when autopilot is off: tell the user it is waiting in the Approvals tab rather than retrying.
- Guardrails (per-campaign and total daily budget caps) are enforced by the system; if an action is rejected for a cap, explain it and propose an alternative within the cap.
- When analysing performance, pull fresh metrics, compare campaigns on CTR, CPC and CPA, and give specific recommendations. Pause clear losers when the evidence is strong (meaningful spend with poor results) and explain why.
- For ongoing monitoring, create monitor rules (e.g. pause when CPA > target after a minimum spend).
- Users get 5 free campaigns on real ad platforms (Sandbox campaigns are free); after that create_campaign fails until they subscribe (₹999/month or ₹11,988/year) on the Billing page. If that happens, say so plainly and don't retry.
- Budgets are in the ad account's currency, per day. Be concise; use short bullet lists and tables when comparing campaigns.`;

const tools = [
  {
    name: "list_connections",
    description: "List connected ad platform accounts (id, platform, account name, currency).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_campaigns",
    description: "List campaigns managed by AdPilot with status, daily budget and the latest cached metrics for today.",
    input_schema: {
      type: "object",
      properties: { connection_id: { type: "string", description: "Optional filter by connection" } },
      additionalProperties: false,
    },
  },
  {
    name: "sync_campaigns",
    description: "Import/refresh the campaign list from an ad platform account so existing campaigns can be managed.",
    input_schema: {
      type: "object",
      properties: { connection_id: { type: "string" } },
      required: ["connection_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_campaign_metrics",
    description: "Fetch fresh performance metrics (spend, impressions, clicks, conversions, ctr, cpc, cpa) from the platform.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        range: { type: "string", enum: ["today", "last_7d"] },
      },
      required: ["campaign_id", "range"],
      additionalProperties: false,
    },
  },
  {
    name: "create_campaign",
    description: "Create a new campaign (created PAUSED) on a connected platform.",
    input_schema: {
      type: "object",
      properties: {
        connection_id: { type: "string" },
        name: { type: "string" },
        objective: { type: "string", enum: ["traffic", "awareness", "engagement", "leads", "sales", "app_installs"] },
        daily_budget: { type: "number", description: "Daily budget in account currency" },
        countries: { type: "array", items: { type: "string" }, description: "ISO 3166-1 alpha-2 codes, e.g. US, IN" },
        age_min: { type: "integer" },
        age_max: { type: "integer" },
      },
      required: ["connection_id", "name", "objective", "daily_budget"],
      additionalProperties: false,
    },
  },
  {
    name: "launch_campaign",
    description: "Set a campaign live. May return pending_approval if a human must approve.",
    input_schema: {
      type: "object",
      properties: { campaign_id: { type: "string" }, reason: { type: "string" } },
      required: ["campaign_id", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "pause_campaign",
    description: "Pause a campaign immediately (never requires approval).",
    input_schema: {
      type: "object",
      properties: { campaign_id: { type: "string" }, reason: { type: "string" } },
      required: ["campaign_id", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "update_budget",
    description: "Change a campaign's daily budget. Increases may return pending_approval.",
    input_schema: {
      type: "object",
      properties: { campaign_id: { type: "string" }, daily_budget: { type: "number" }, reason: { type: "string" } },
      required: ["campaign_id", "daily_budget", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "list_rules",
    description: "List monitoring rules.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_rule",
    description:
      "Create a monitoring rule evaluated every monitor cycle on today's metrics. For ctr the value is in percent (1 = 1%). Omit campaign_id to apply to all campaigns.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        campaign_id: { type: "string" },
        metric: { type: "string", enum: METRICS },
        op: { type: "string", enum: [">", "<"] },
        value: { type: "number" },
        action: { type: "string", enum: ["alert", "pause"] },
        min_spend: { type: "number", description: "Only evaluate after this much spend today" },
      },
      required: ["metric", "op", "value", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "get_settings",
    description: "Get guardrail settings: autopilot, per-campaign and total daily budget caps.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_recent_activity",
    description: "Recent activity log: launches, pauses, alerts, approvals, errors.",
    input_schema: { type: "object", properties: { limit: { type: "integer" } }, additionalProperties: false },
  },
];

const campaignView = (c) => ({
  id: c.id,
  name: c.name,
  platform: c.platform,
  connection_id: c.connectionId,
  status: c.status,
  objective: c.objective,
  daily_budget: c.dailyBudget,
  metrics_today: c.metrics,
});

async function runTool(name, input, actor) {
  switch (name) {
    case "list_connections":
      return db().connections.map((c) => ({
        id: c.id,
        platform: c.platform,
        platform_label: platforms[c.platform].label,
        account: c.accountInfo,
      }));
    case "list_campaigns":
      return db()
        .campaigns.filter((c) => !input.connection_id || c.connectionId === input.connection_id)
        .map(campaignView);
    case "sync_campaigns":
      return actions.importCampaigns(input.connection_id);
    case "get_campaign_metrics":
      return actions.refreshMetrics(actions.findCampaign(input.campaign_id), input.range);
    case "create_campaign": {
      const r = await actions.createCampaign(
        {
          connectionId: input.connection_id,
          name: input.name,
          objective: input.objective,
          dailyBudget: input.daily_budget,
          countries: input.countries,
          ageMin: input.age_min,
          ageMax: input.age_max,
        },
        actor,
      );
      return { campaign: campaignView(r.campaign), warning: r.warning };
    }
    case "launch_campaign":
      return summarize(await actions.perform("launch", { campaignId: input.campaign_id }, actor, input.reason));
    case "pause_campaign":
      return summarize(await actions.perform("pause", { campaignId: input.campaign_id }, actor, input.reason));
    case "update_budget":
      return summarize(
        await actions.perform("update_budget", { campaignId: input.campaign_id, dailyBudget: input.daily_budget }, actor, input.reason),
      );
    case "list_rules":
      return db().rules.map(({ fired, ...r }) => r);
    case "create_rule": {
      const { fired, ...rule } = createRule({
        name: input.name,
        campaignId: input.campaign_id,
        metric: input.metric,
        op: input.op,
        value: input.value,
        action: input.action,
        minSpend: input.min_spend,
      });
      return rule;
    }
    case "get_settings":
      return db().settings;
    case "get_recent_activity":
      return db().activity.slice(0, input.limit || 20);
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

const summarize = (r) => (r.status === "done" ? { status: "done", campaign: campaignView(r.campaign) } : r);

const STALE_MS = 16 * 60 * 1000; // background functions stop after 15 minutes

export class AgentError extends Error {
  status = 400;
}

async function findConvo(conversationId) {
  const convo = await getConversation(currentUserId(), conversationId);
  if (!convo) throw new AgentError("Conversation not found");
  return convo;
}
const isRunning = (convo) => !!convo.running && Date.now() - (convo.runStartedAt || 0) < STALE_MS;

export const getTranscript = async (conversationId) => transcript(await findConvo(conversationId));

/** Checks limits, appends the user's message and marks the conversation as running. */
export async function startTurn(conversationId, text) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AgentError("The AI agent isn't configured on the server yet");
  }
  const convo = await findConvo(conversationId);
  if (isRunning(convo)) throw new AgentError("The agent is still working on this conversation");
  if (convo.messages.length >= MAX_HISTORY) throw new AgentError("This conversation is getting long. Start a new conversation to continue.");
  const allowed = await allowance();
  if (allowed.blocked) throw new AgentError(allowed.blocked);
  usage().agentMessages++;
  convo.messages.push({ role: "user", content: `[${new Date().toISOString()}] ${text}` });
  if (!convo.title || convo.title === "New conversation") convo.title = text.slice(0, 60);
  Object.assign(convo, { running: true, runStartedAt: Date.now(), error: null });
  await saveConversation(currentUserId(), convo);
  return convo;
}

/**
 * Starts runTurn: in-process on the local server, or in the agent-background
 * Netlify function (agent turns can outlast the 60s synchronous limit).
 */
export async function dispatchTurn(conversationId, actor = "agent", baseUrl) {
  const userId = currentUserId();
  if (!runtime.netlify) {
    // Fresh context so the run outlives the request that started it.
    withUser(userId, () => runTurn(conversationId, actor)).catch((e) => console.error(e));
    return;
  }
  let problem;
  try {
    const res = await fetch(`${baseUrl || process.env.URL}/.netlify/functions/agent-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, conversationId, actor, sig: sign(`agent:${userId}:${conversationId}`) }),
    });
    if (!res.ok) problem = `HTTP ${res.status}`;
  } catch (e) {
    problem = e.message;
  }
  if (problem) {
    const convo = await findConvo(conversationId);
    await saveConversation(userId, { ...convo, running: false, error: `Could not start the agent (${problem})` });
    throw new Error(`Could not start the agent (${problem})`);
  }
}

export const verifyDispatch = ({ userId, conversationId, sig }) =>
  typeof sig === "string" && typeof userId === "string" && sig === sign(`agent:${userId}:${conversationId}`);

/** Runs the agent loop until the turn ends. Only this run writes the conversation while it is running. */
export async function runTurn(conversationId, actor = "agent") {
  const userId = currentUserId();
  const convo = await findConvo(conversationId);
  let error = null;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // Pick up changes other invocations (UI, monitor) made while we waited on Claude.
      await load();
      const allowed = await allowance();
      if (allowed.costUsd >= allowed.monthlyUsd) {
        error = "Stopped: this month's AI agent allowance is used up.";
        break;
      }
      const response = await anthropic().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: tools.map((t) => ({ ...t, strict: true })),
        messages: convo.messages,
        output_config: { effort: "medium" },
        // Re-run on a fallback model if a safety classifier declines the request.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      await load();
      usage().aiCostUsd += costOf(response.usage);

      const content = response.content.length ? response.content : [{ type: "text", text: "(no response)" }];
      convo.messages.push({ role: "assistant", content });
      await Promise.all([persist(), saveConversation(userId, convo)]);

      if (response.stop_reason === "refusal") {
        log("error", `Agent request declined (${response.stop_details?.category || "policy"})`);
        break;
      }
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason === "max_tokens") {
        // Close any half-written tool calls so the history stays valid for the next turn.
        const dangling = content.filter((b) => b.type === "tool_use");
        if (dangling.length) {
          convo.messages.push({
            role: "user",
            content: dangling.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: "Not run: response was truncated.", is_error: true })),
          });
        }
        break;
      }
      if (response.stop_reason !== "tool_use") break;

      const toolResults = await Promise.all(
        content
          .filter((b) => b.type === "tool_use")
          .map(async (b) => {
            try {
              const out = await runTool(b.name, b.input, actor);
              return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out ?? { ok: true }) };
            } catch (e) {
              return { type: "tool_result", tool_use_id: b.id, content: e.message, is_error: true };
            }
          }),
      );
      convo.messages.push({ role: "user", content: toolResults });
      await Promise.all([persist(), saveConversation(userId, convo)]);
    }
  } catch (e) {
    error = e.message;
    log("error", `Agent run failed: ${e.message}`);
  } finally {
    Object.assign(convo, { running: false, error });
    await Promise.all([persist(), saveConversation(userId, convo)]);
  }
}

/** Flattens stored API messages into display items for the UI. */
export function transcript(convo) {
  const items = [];
  const results = new Map();
  for (const m of convo.messages) {
    if (Array.isArray(m.content)) for (const b of m.content) if (b.type === "tool_result") results.set(b.tool_use_id, b);
  }
  for (const m of convo.messages) {
    if (typeof m.content === "string") {
      items.push({ role: m.role, text: m.content.replace(/^\[[^\]]+\]\s*/, "") });
      continue;
    }
    for (const b of m.content) {
      if (b.type === "text" && b.text.trim()) items.push({ role: m.role, text: b.text });
      if (b.type === "tool_use") {
        const r = results.get(b.id);
        items.push({
          role: "tool",
          name: b.name,
          input: b.input,
          error: !!r?.is_error,
          result: r ? String(r.content).slice(0, 2000) : null,
        });
      }
    }
  }
  return { id: convo.id, title: convo.title, items, running: isRunning(convo), error: convo.error || null };
}

export async function newConversation(title = "New conversation") {
  const convo = { id: id("cnv"), title, messages: [], running: false, createdAt: new Date().toISOString() };
  await saveConversation(currentUserId(), convo);
  return convo;
}

/** Periodic autonomous review triggered by the monitor (opt-in). */
export async function runReview({ baseUrl } = {}) {
  const convo = await newConversation(`Automated review ${new Date().toLocaleString()}`);
  await startTurn(
    convo.id,
    "Automated monitoring review: pull today's metrics for every active campaign, flag anomalies, pause clear underperformers, and summarise recommendations in under 150 words.",
  );
  await persist();
  await dispatchTurn(convo.id, "agent (auto-review)", baseUrl);
  log("review", `AI review started — see conversation "${convo.title}"`);
}
