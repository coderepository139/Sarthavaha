// TikTok Business (Marketing) API v1.3 adapter.
// Docs: https://business-api.tiktok.com/portal/docs
import { request, round2, PlatformError } from "./http.js";

export const TIKTOK_API = process.env.TIKTOK_API_BASE || "https://business-api.tiktok.com";
const BASE = `${TIKTOK_API}/open_api/v1.3`;
const OBJECTIVES = {
  traffic: "TRAFFIC",
  awareness: "REACH",
  engagement: "ENGAGEMENT",
  leads: "LEAD_GENERATION",
  sales: "WEB_CONVERSIONS",
  app_installs: "APP_PROMOTION",
};

async function call(c, pathname, { method = "GET", query, body } = {}) {
  const url = new URL(`${BASE}/${pathname}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const r = await request("tiktok", url, { method, headers: { "Access-Token": c.accessToken }, body });
  if (r.code !== 0) throw new PlatformError("tiktok", r.message || `code ${r.code}`, r);
  return r.data;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default {
  id: "tiktok",
  label: "TikTok Ads",
  oauth: true, // connected with "Connect with TikTok" (see oauth.js), never with pasted keys

  async validate({ creds }) {
    const d = await call(creds, "advertiser/info/", { query: { advertiser_ids: [creds.advertiserId] } });
    const a = d.list?.[0];
    return { accountName: a?.name, currency: a?.currency };
  },

  async createCampaign({ creds }, spec) {
    const d = await call(creds, "campaign/create/", {
      method: "POST",
      body: {
        advertiser_id: creds.advertiserId,
        campaign_name: spec.name,
        objective_type: OBJECTIVES[spec.objective] || "TRAFFIC",
        budget_mode: "BUDGET_MODE_DAY",
        budget: spec.dailyBudget,
        operation_status: "DISABLE",
      },
    });
    return { externalId: String(d.campaign_id), warning: "Add an ad group and creatives in TikTok Ads Manager before launching." };
  },

  async setStatus({ creds }, externalId, status) {
    await call(creds, "campaign/status/update/", {
      method: "POST",
      body: { advertiser_id: creds.advertiserId, campaign_ids: [externalId], operation_status: status === "active" ? "ENABLE" : "DISABLE" },
    });
  },

  async updateBudget({ creds }, externalId, dailyBudget) {
    await call(creds, "campaign/update/", {
      method: "POST",
      body: { advertiser_id: creds.advertiserId, campaign_id: externalId, budget: dailyBudget },
    });
  },

  async getMetrics({ creds }, externalId, range = "today") {
    const d = await call(creds, "report/integrated/get/", {
      query: {
        advertiser_id: creds.advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_CAMPAIGN",
        dimensions: ["campaign_id"],
        metrics: ["spend", "impressions", "clicks", "conversion"],
        start_date: range === "today" ? today() : daysAgo(6),
        end_date: today(),
        filtering: [{ field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify([externalId]) }],
      },
    });
    const m = d.list?.[0]?.metrics || {};
    return { spend: round2(m.spend), impressions: Number(m.impressions || 0), clicks: Number(m.clicks || 0), conversions: Number(m.conversion || 0) };
  },

  async listCampaigns({ creds }) {
    const d = await call(creds, "campaign/get/", { query: { advertiser_id: creds.advertiserId, page_size: "100" } });
    return (d.list || []).map((c) => ({
      externalId: String(c.campaign_id),
      name: c.campaign_name,
      status: c.operation_status === "ENABLE" ? "active" : "paused",
      dailyBudget: c.budget ?? null,
    }));
  },
};
