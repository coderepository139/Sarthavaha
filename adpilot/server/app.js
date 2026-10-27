import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, persist, log, withUser } from "./db.js";
import { snapshotsSince, listConversations, deleteConversation } from "./store.js";
import { authenticate, publicConfig, authMode } from "./auth.js";
import * as billing from "./billing.js";
import * as oauth from "./oauth.js";
import { getAccount } from "./store.js";
import { prime } from "./db.js";
import { describePlatforms } from "./platforms/index.js";
import * as actions from "./actions.js";
import * as monitor from "./monitor.js";
import * as agent from "./agent.js";

// The console UI lives in the site's public/console folder (served at /console).
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

// Absolute origin of this deployment, used to call the agent background function.
const originOf = (req) => `${req.protocol}://${req.get("host")}`;

// Must match the redirect URI registered with each ad platform exactly; PUBLIC_URL pins it.
const oauthRedirectUri = (req, platform) => `${process.env.PUBLIC_URL || originOf(req)}/api/oauth/${platform}/callback`;

const statusOf = (e) => e.status || (e instanceof actions.ActionError ? 400 : 502);

/** Builds the Express app. Used by the local server (index.js) and the Netlify api function. */
export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  // Keep the raw body: Razorpay webhook signatures are computed over it.
  app.use(express.json({ limit: "1mb", verify: (req, res, buf) => (req.rawBody = buf.toString("utf8")) }));

  // ---------- public routes ----------
  app.get("/api/config", (req, res) => res.json(publicConfig()));
  app.post("/api/billing/webhook", async (req, res) => {
    try {
      res.json(await billing.handleWebhook(req.rawBody || "", req.get("x-razorpay-signature")));
    } catch (e) {
      console.error("webhook:", e.message);
      res.status(statusOf(e)).json({ error: e.message });
    }
  });

  // The ad platform redirects the browser here after consent. There's no bearer token on this
  // request; the signed `state` says which user started the sign-in.
  app.get("/api/oauth/:platform/callback", async (req, res) => {
    const state = oauth.readState(req.query.state);
    if (!state) return res.redirect(302, `${oauth.CONSOLE_PATH}?oauth_error=${encodeURIComponent("Sign-in link expired. Please try again.")}#connections`);
    try {
      const location = await withUser(state.userId, async () => {
        const loc = await oauth.callback(req.params.platform, req.query, state, oauthRedirectUri(req, req.params.platform));
        await persist();
        return loc;
      });
      res.redirect(302, location);
    } catch (e) {
      console.error("oauth callback:", e);
      res.redirect(302, `${oauth.CONSOLE_PATH}?oauth_error=${encodeURIComponent("Something went wrong. Please try again.")}#connections`);
    }
  });

  // ---------- auth: every other /api route runs as the signed-in user ----------
  app.use("/api", async (req, res, next) => {
    try {
      if (authMode() === "unconfigured") {
        return res.status(503).json({ error: "The server isn't configured yet (missing environment variables)." });
      }
      const user = await authenticate(req);
      if (!user) return res.status(401).json({ error: "Please sign in" });
      req.user = user;
      // Most pages need the billing account; fetch it while the user's data loads.
      const account = getAccount(user.id);
      // Load this user's data for the rest of the request.
      await withUser(
        user.id,
        () =>
          new Promise((resolve) => {
            prime(billing.accountKey(user.id), account);
            res.on("finish", resolve);
            res.on("close", resolve);
            next();
          }),
      );
    } catch (e) {
      next(e);
    }
  });

  const route = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      await persist();
      res.json(out ?? { ok: true });
    } catch (e) {
      if (!e.status) console.error(e); // expected errors (validation, quota, billing) carry a status
      res.status(statusOf(e)).json({ error: e.message });
    }
  };

  app.get(
    "/api/me",
    route(async (req) => ({
      email: req.user.email,
      agentReady: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      billing: await billing.summary(req.user.id),
    })),
  );

  // ---------- billing ----------
  app.get(
    "/api/billing",
    route((req) => billing.summary(req.user.id)),
  );
  app.post(
    "/api/billing/subscribe",
    route((req) => billing.subscribe(req.user.id, req.user.email, req.body.plan)),
  );
  app.post(
    "/api/billing/verify",
    route((req) => billing.verifyCheckout(req.user.id, req.body)),
  );
  app.post(
    "/api/billing/cancel",
    route((req) => billing.cancel(req.user.id)),
  );

  // ---------- platforms & connections ----------
  app.get(
    "/api/platforms",
    route(() => describePlatforms(oauth.providerStatus())),
  );
  app.get(
    "/api/connections",
    route(() => db().connections.map(actions.publicConnection)),
  );
  app.post(
    "/api/connections",
    // Only the Sandbox is added directly; real ad accounts come from "Connect with ..." (OAuth).
    route((req) => {
      if (req.body.platform !== "sandbox") throw new actions.ActionError("Use the Connect button to sign in to this ad platform.");
      return actions.addConnection({ platform: "sandbox", name: "Sandbox" });
    }),
  );

  // ---------- "Connect with ..." (OAuth) ----------
  app.post(
    "/api/oauth/:platform/start",
    route((req) => oauth.start(req.params.platform, oauthRedirectUri(req, req.params.platform))),
  );
  app.get(
    "/api/oauth/pending",
    route(() => oauth.pending()),
  );
  app.post(
    "/api/oauth/finish",
    route((req) => oauth.finish(Array.isArray(req.body.accountIds) ? req.body.accountIds.map(String) : [])),
  );
  app.post(
    "/api/oauth/cancel",
    route(() => oauth.cancel()),
  );
  app.post(
    "/api/connections/:id/test",
    route((req) => actions.testConnection(req.params.id)),
  );
  app.post(
    "/api/connections/:id/sync",
    route((req) => actions.importCampaigns(req.params.id)),
  );
  app.delete(
    "/api/connections/:id",
    route((req) => actions.removeConnection(req.params.id)),
  );

  // ---------- campaigns ----------
  app.get(
    "/api/campaigns",
    route(() => db().campaigns),
  );
  app.post(
    "/api/campaigns",
    route((req) => actions.createCampaign(req.body, "user")),
  );
  app.post(
    "/api/campaigns/:id/launch",
    route((req) => actions.perform("launch", { campaignId: req.params.id }, "user")),
  );
  app.post(
    "/api/campaigns/:id/pause",
    route((req) => actions.perform("pause", { campaignId: req.params.id }, "user")),
  );
  app.post(
    "/api/campaigns/:id/budget",
    route((req) => actions.perform("update_budget", { campaignId: req.params.id, dailyBudget: req.body.dailyBudget }, "user")),
  );
  app.post(
    "/api/campaigns/:id/refresh",
    route((req) => actions.refreshMetrics(actions.findCampaign(req.params.id))),
  );
  app.delete(
    "/api/campaigns/:id",
    route((req) => {
      const c = actions.findCampaign(req.params.id);
      db().campaigns = db().campaigns.filter((x) => x.id !== c.id);
      log("remove", `Stopped tracking "${c.name}" (campaign not deleted on platform)`);
    }),
  );

  // ---------- dashboard ----------
  app.get(
    "/api/dashboard",
    route(async (req) => {
      const d = db();
      const totals = { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      for (const c of d.campaigns) for (const k in totals) totals[k] += c.metrics?.[k] || 0;
      for (const k in totals) totals[k] = Math.round(totals[k] * 100) / 100;
      // Total spend-today over the last 24h: replay snapshots, keeping the latest value per campaign.
      const since = Date.now() - 864e5;
      const latest = new Map();
      const series = [];
      const BUCKET = 60000;
      let bucket = null;
      for (const s of await snapshotsSince(req.user.id, since)) {
        const b = Math.floor(s.at / BUCKET) * BUCKET;
        if (bucket !== null && b !== bucket) series.push({ at: bucket, spend: sum(latest) });
        bucket = b;
        latest.set(s.campaignId, s.spend);
      }
      if (bucket !== null) series.push({ at: bucket, spend: sum(latest) });
      return {
        totals,
        active: d.campaigns.filter((c) => c.status === "active").length,
        campaigns: d.campaigns.length,
        connections: d.connections.length,
        pendingApprovals: d.approvals.filter((a) => a.status === "pending").length,
        activeBudget: d.campaigns.filter((c) => c.status === "active").reduce((s, c) => s + (c.dailyBudget || 0), 0),
        series,
        monitor: d.monitor,
        recent: d.activity.slice(0, 8),
      };
    }),
  );
  const sum = (m) => Math.round([...m.values()].reduce((a, b) => a + b, 0) * 100) / 100;

  // ---------- rules, approvals, activity, settings ----------
  app.get(
    "/api/rules",
    route(() => db().rules),
  );
  app.post(
    "/api/rules",
    route((req) => monitor.createRule(req.body)),
  );
  app.patch(
    "/api/rules/:id",
    route((req) => {
      const r = db().rules.find((x) => x.id === req.params.id);
      if (!r) throw new actions.ActionError("Rule not found");
      r.enabled = !!req.body.enabled;
      return r;
    }),
  );
  app.delete(
    "/api/rules/:id",
    route((req) => void (db().rules = db().rules.filter((r) => r.id !== req.params.id))),
  );

  app.get(
    "/api/approvals",
    route(() => db().approvals.slice(0, 100)),
  );
  app.post(
    "/api/approvals/:id/approve",
    route((req) => actions.decideApproval(req.params.id, true)),
  );
  app.post(
    "/api/approvals/:id/reject",
    route((req) => actions.decideApproval(req.params.id, false)),
  );

  app.get(
    "/api/activity",
    route(() => db().activity.slice(0, 200)),
  );

  app.get(
    "/api/settings",
    route(() => db().settings),
  );
  app.put(
    "/api/settings",
    route((req) => {
      const s = db().settings;
      const b = req.body;
      if ("autopilot" in b) s.autopilot = !!b.autopilot;
      if ("aiReviewEnabled" in b) s.aiReviewEnabled = !!b.aiReviewEnabled;
      for (const k of ["maxCampaignDailyBudget", "maxTotalDailyBudget", "monitorIntervalMinutes"]) {
        if (k in b) {
          const n = Number(b[k]);
          if (!(n > 0)) throw new actions.ActionError(`${k} must be a positive number`);
          s[k] = n;
        }
      }
      log("settings", `Settings updated${"autopilot" in b ? ` (autopilot ${s.autopilot ? "ON" : "OFF"})` : ""}`);
      return s;
    }),
  );

  app.post(
    "/api/monitor/run",
    route(async (req) => (await monitor.runOnce({ baseUrl: originOf(req) }), db().monitor)),
  );

  // Everything the sidebar needs, in one call (the UI refreshes this, not each list).
  app.get(
    "/api/summary",
    route(async (req) => ({
      autopilot: db().settings.autopilot,
      pendingApprovals: db().approvals.filter((a) => a.status === "pending").length,
      billing: await billing.summary(req.user.id),
      ai: await agent.allowance(),
    })),
  );

  // ---------- agent conversations ----------
  app.get(
    "/api/conversations",
    route((req) => listConversations(req.user.id)),
  );
  app.post(
    "/api/conversations",
    route(async () => agent.transcript(await agent.newConversation())),
  );
  app.get(
    "/api/conversations/:id",
    route((req) => agent.getTranscript(req.params.id)),
  );
  app.post(
    "/api/conversations/:id/messages",
    route(async (req) => {
      const convo = await agent.startTurn(req.params.id, String(req.body.text || "").slice(0, 8000));
      await persist(); // saves the usage counter before the background run starts
      await agent.dispatchTurn(convo.id, "agent", originOf(req));
      return agent.transcript(convo);
    }),
  );
  app.delete(
    "/api/conversations/:id",
    route((req) => deleteConversation(req.user.id, req.params.id)),
  );

  // ---------- static UI ----------
  // Local dev only (on Netlify the CDN serves these): the console at /console.
  app.use("/console", express.static(path.join(PUBLIC, "console")));
  app.get("/console/*", (req, res) => res.sendFile(path.join(PUBLIC, "console", "index.html")));
  app.get("/", (req, res) => res.redirect("/console/"));

  return app;
}
