// Meta (Facebook/Instagram) Marketing API adapter.
// Docs: https://developers.facebook.com/docs/marketing-api
import crypto from "node:crypto";
import { request, round2, PlatformError } from "./http.js";

const OBJECTIVES = {
  traffic: "OUTCOME_TRAFFIC",
  awareness: "OUTCOME_AWARENESS",
  engagement: "OUTCOME_ENGAGEMENT",
  leads: "OUTCOME_LEADS",
  sales: "OUTCOME_SALES",
  app_installs: "OUTCOME_APP_PROMOTION",
};
const OPTIMIZATION = {
  traffic: "LINK_CLICKS",
  awareness: "REACH",
  engagement: "POST_ENGAGEMENT",
  leads: "LINK_CLICKS",
  sales: "LINK_CLICKS",
  app_installs: "LINK_CLICKS",
};

export const META_GRAPH = process.env.META_API_BASE || "https://graph.facebook.com";
export const META_VERSION = "v23.0";
const base = () => `${META_GRAPH}/${META_VERSION}`;
const act = (c) => (c.adAccountId.startsWith("act_") ? c.adAccountId : `act_${c.adAccountId}`);
/** Meta's appsecret_proof, required when the app has "Require App Secret" switched on. */
export const proof = (token) =>
  process.env.META_APP_SECRET ? crypto.createHmac("sha256", process.env.META_APP_SECRET).update(token).digest("hex") : undefined;

const call = (c, pathname, opts = {}) => {
  const url = new URL(`${base()}/${pathname}`);
  const auth = { access_token: c.accessToken, ...(proof(c.accessToken) && { appsecret_proof: proof(c.accessToken) }) };
  if (!opts.form) for (const [k, v] of Object.entries(auth)) url.searchParams.set(k, v);
  for (const [k, v] of Object.entries(opts.query || {})) url.searchParams.set(k, v);
  const form = opts.form ? { ...opts.form, ...auth } : undefined;
  return request("meta", url, { method: opts.method || (form ? "POST" : "GET"), form });
};
// Meta budgets are in the account currency's minor unit (cents).
const toMinor = (n) => String(Math.round(Number(n) * 100));

export default {
  id: "meta",
  label: "Meta Ads (Facebook & Instagram)",
  oauth: true, // connected with "Connect with Meta" (see oauth.js), never with pasted keys

  async validate({ creds }) {
    const r = await call(creds, act(creds), { query: { fields: "name,currency,account_status" } });
    return { accountName: r.name, currency: r.currency };
  },

  async createCampaign({ creds }, spec) {
    const campaign = await call(creds, `${act(creds)}/campaigns`, {
      form: {
        name: spec.name,
        objective: OBJECTIVES[spec.objective] || OBJECTIVES.traffic,
        status: "PAUSED",
        special_ad_categories: JSON.stringify([]),
        daily_budget: toMinor(spec.dailyBudget),
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      },
    });
    // An ad set holds targeting. Ads themselves need a creative + Page, which are
    // added in Ads Manager or via a follow-up API call.
    const targeting = {
      geo_locations: { countries: spec.countries?.length ? spec.countries : ["US"] },
      age_min: spec.ageMin || 18,
      age_max: spec.ageMax || 65,
    };
    let adSetId = null;
    try {
      const adSet = await call(creds, `${act(creds)}/adsets`, {
        form: {
          name: `${spec.name} - Ad set 1`,
          campaign_id: campaign.id,
          billing_event: "IMPRESSIONS",
          optimization_goal: OPTIMIZATION[spec.objective] || "LINK_CLICKS",
          targeting: JSON.stringify(targeting),
          status: "PAUSED",
        },
      });
      adSetId = adSet.id;
    } catch (e) {
      return { externalId: campaign.id, warning: `Campaign created, ad set failed: ${e.message}` };
    }
    return { externalId: campaign.id, extra: { adSetId } };
  },

  async setStatus({ creds }, externalId, status) {
    await call(creds, externalId, { form: { status: status === "active" ? "ACTIVE" : "PAUSED" } });
  },

  async updateBudget({ creds }, externalId, dailyBudget) {
    await call(creds, externalId, { form: { daily_budget: toMinor(dailyBudget) } });
  },

  async getMetrics({ creds }, externalId, range = "today") {
    const r = await call(creds, `${externalId}/insights`, {
      query: { fields: "spend,impressions,clicks,actions", date_preset: range === "today" ? "today" : "last_7d" },
    });
    const row = r.data?.[0];
    if (!row) return { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    const conv = (row.actions || [])
      .filter((a) => ["purchase", "lead", "offsite_conversion.fb_pixel_purchase", "complete_registration"].includes(a.action_type))
      .reduce((s, a) => s + Number(a.value), 0);
    return { spend: round2(row.spend), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0), conversions: conv };
  },

  async listCampaigns({ creds }) {
    const r = await call(creds, `${act(creds)}/campaigns`, { query: { fields: "id,name,status,daily_budget,objective", limit: "100" } });
    if (!r.data) throw new PlatformError("meta", "Unexpected response listing campaigns", r);
    return r.data.map((c) => ({
      externalId: c.id,
      name: c.name,
      status: c.status === "ACTIVE" ? "active" : "paused",
      dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    }));
  },
};
