// Simulated ad platform so the whole app (agent, approvals, monitoring, rules)
// can be exercised without real ad spend. Time runs 60x faster than real time:
// one real minute of an active campaign spends about one hour of its daily budget.
import crypto from "node:crypto";
import { db } from "../db.js";
import { round2, PlatformError } from "./http.js";

const SPEEDUP = 60;

function store(connectionId) {
  const s = db().sandbox;
  s[connectionId] ||= { campaigns: {} };
  return s[connectionId];
}

// Deterministic per-campaign "quality" so some campaigns perform well and some poorly.
function profile(name) {
  const h = crypto.createHash("md5").update(name).digest();
  return {
    cpm: 4 + (h[0] / 255) * 12, // $4-$16
    ctr: 0.004 + (h[1] / 255) * 0.03, // 0.4%-3.4%
    cvr: 0.01 + (h[2] / 255) * 0.08, // 1%-9%
  };
}

function accrue(c) {
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  if (c.day !== day) Object.assign(c, { day, today: { spend: 0, impressions: 0, clicks: 0, conversions: 0 } });
  if (c.status === "active") {
    const minutes = ((now - c.lastTick) / 60000) * SPEEDUP;
    const room = Math.max(0, c.dailyBudget - c.today.spend);
    const spend = Math.min(room, (c.dailyBudget / 1440) * minutes * (0.85 + Math.random() * 0.3));
    const p = profile(c.name);
    const impressions = (spend / p.cpm) * 1000;
    const clicks = impressions * p.ctr * (0.8 + Math.random() * 0.4);
    c.today.spend += spend;
    c.today.impressions += impressions;
    c.today.clicks += clicks;
    c.today.conversions += clicks * p.cvr;
    c.week.spend += spend;
    c.week.impressions += impressions;
    c.week.clicks += clicks;
    c.week.conversions += clicks * p.cvr;
  }
  c.lastTick = now;
}

const fmt = (m) => ({
  spend: round2(m.spend),
  impressions: Math.round(m.impressions),
  clicks: Math.round(m.clicks),
  conversions: Math.round(m.conversions),
});

function get(ctx, externalId) {
  const c = store(ctx.connectionId).campaigns[externalId];
  if (!c) throw new PlatformError("sandbox", `Campaign ${externalId} not found`);
  accrue(c);
  return c;
}

export default {
  id: "sandbox",
  label: "Sandbox (simulated, no real spend)",
  oauth: false, // no keys or sign-in needed

  async validate({ creds }) {
    return { accountName: creds.accountName || "Sandbox account", currency: "USD" };
  },

  async createCampaign(ctx, spec) {
    const externalId = String(Date.now()) + Math.floor(Math.random() * 1000);
    const zero = () => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0 });
    store(ctx.connectionId).campaigns[externalId] = {
      name: spec.name,
      objective: spec.objective,
      dailyBudget: spec.dailyBudget,
      status: "paused",
      lastTick: Date.now(),
      day: new Date().toISOString().slice(0, 10),
      today: zero(),
      week: zero(),
    };
    return { externalId };
  },

  async setStatus(ctx, externalId, status) {
    get(ctx, externalId).status = status;
  },

  async updateBudget(ctx, externalId, dailyBudget) {
    get(ctx, externalId).dailyBudget = dailyBudget;
  },

  async getMetrics(ctx, externalId, range = "today") {
    const c = get(ctx, externalId);
    return fmt(range === "today" ? c.today : c.week);
  },

  async listCampaigns(ctx) {
    return Object.entries(store(ctx.connectionId).campaigns).map(([externalId, c]) => ({
      externalId,
      name: c.name,
      status: c.status,
      dailyBudget: c.dailyBudget,
    }));
  },
};
