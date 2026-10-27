// AdPilot dashboard — dependency-free single page app.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n == null ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const int = (n) => (n == null ? "—" : Math.round(n).toLocaleString());
const pct = (n) => (n == null ? "—" : `${(n * 100).toFixed(2)}%`);
const ago = (t) => {
  const s = (Date.now() - new Date(t)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
};

const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// ---------- auth (Firebase Google sign-in in production, email-only dev sign-in locally) ----------
const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/12.15.0";
const auth = { mode: null, fb: null, sdk: null, devToken: null };

async function initAuth() {
  const cfg = await (await fetch("/api/config")).json();
  auth.mode = cfg.authMode;
  if (auth.mode === "unconfigured") {
    // Production deploy without its environment variables: say so instead of a broken login.
    $("#login-form").innerHTML = `<div class="brand"><span class="logo"></span>AdPilot</div>
      <p class="error">The site isn't fully set up yet, so sign-in is disabled.</p>
      <p class="muted small-text">Missing server settings (Netlify → Project configuration → Environment variables, Functions scope, then redeploy):</p>
      <ul class="small-text">${(cfg.missing || []).map((k) => `<li><code>${esc(k)}</code></li>`).join("")}</ul>`;
    return;
  }
  if (auth.mode === "firebase") {
    // Same Firebase project as the Sarthavaha site, so a Google sign-in there carries over here.
    const [{ initializeApp }, sdk] = await Promise.all([import(`${FIREBASE_SDK}/firebase-app.js`), import(`${FIREBASE_SDK}/firebase-auth.js`)]);
    auth.sdk = sdk;
    auth.fb = sdk.getAuth(initializeApp(cfg.firebase));
    auth.fb.useDeviceLanguage();
    await sdk.getRedirectResult(auth.fb).catch((e) => loginMsg(signInError(e)));
    await auth.fb.authStateReady();
    $("#login-dev").classList.add("hidden");
    $("#login-dev-form").classList.add("hidden");
  } else {
    try {
      auth.devToken = localStorage.getItem("adpilot_dev_token");
    } catch {}
    $("#login-dev").classList.remove("hidden");
    $("#login-dev-form").classList.remove("hidden");
    ["#login-google", "#login-divider"].forEach((sel) => $(sel).classList.add("hidden"));
  }
}

async function accessToken() {
  // getIdToken() refreshes the hour-long Firebase token automatically.
  if (auth.mode === "firebase") return (await auth.fb.currentUser?.getIdToken()) || null;
  return auth.devToken;
}

function signInError(e) {
  const code = e?.code || "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "";
  if (code.includes("unauthorized-domain")) return "This website isn't authorised for Google sign-in yet (add it under Firebase → Authentication → Settings → Authorized domains).";
  if (code.includes("network")) return "Network error. Check your connection and try again.";
  return e?.message || "Sign-in failed. Please try again.";
}

async function api(path, opts = {}) {
  const token = await accessToken();
  const headers = { ...(opts.body && { "Content-Type": "application/json" }), ...(token && { Authorization: `Bearer ${token}` }) };
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) showLogin();
  if (res.status === 402) location.hash = "billing"; // free campaigns used up
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast${err ? " err" : ""}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add("hidden"), 4000);
}

async function act(fn, ok) {
  try {
    const r = await fn();
    state.summary = null; // the action may have changed plan, credits or approvals
    if (ok) toast(typeof ok === "function" ? ok(r) : ok);
    await render();
    return r;
  } catch (e) {
    toast(e.message, true);
  }
}

function modal(html, onMount) {
  $("#modal-body").innerHTML = html;
  $("#modal").classList.remove("hidden");
  onMount?.($("#modal-body"));
}
const closeModal = () => $("#modal").classList.add("hidden");
$("#modal").addEventListener("click", (e) => e.target.id === "modal" && closeModal());

// ---------- state & routing ----------
const state = { view: location.hash.slice(1) || "dashboard", platforms: [], me: {}, convoId: null, busy: false };

window.addEventListener("hashchange", () => {
  state.view = location.hash.slice(1) || "dashboard";
  render();
});

let refreshTimer;
async function boot() {
  if (!auth.mode) await initAuth();
  if (auth.mode === "unconfigured" || !(await accessToken())) return showLogin();
  try {
    state.summary = null;
    state.me = await api("/me");
  } catch (e) {
    // Never leave a blank page: show the sign-in card with the reason.
    showLogin();
    if (!/sign in/i.test(e.message)) loginMsg(`Couldn't load your account: ${e.message}`);
    return;
  }
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#user-email").textContent = state.me.email;
  state.platforms = await api("/platforms");
  // A campaign idea typed on the home page ("Plan my campaign") arrives as ?prompt=...
  const q = new URLSearchParams(location.search);
  if (q.get("prompt")) {
    state.pendingPrompt = q.get("prompt").slice(0, 2000);
    q.delete("prompt");
    history.replaceState(null, "", location.pathname + (q.size ? `?${q}` : "") + location.hash);
  }
  await render();
  handleOAuthReturn();
  clearInterval(refreshTimer);
  // Light auto-refresh: once a minute, only while the tab is visible.
  refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible" && ["dashboard", "campaigns", "approvals"].includes(state.view) && !state.busy) render();
  }, 60000);
}

function showLogin() {
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
}

const loginMsg = (text, isError = true) => {
  const el = $("#login-error");
  el.textContent = text || "";
  el.className = isError ? "error" : "muted small-text";
};

$("#login-google").addEventListener("click", async () => {
  loginMsg("");
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = auth.sdk;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth.fb, provider);
    boot();
  } catch (e) {
    // Popups are blocked in some in-app browsers; fall back to a full-page redirect.
    if (String(e?.code).includes("popup-blocked")) return signInWithRedirect(auth.fb, provider);
    loginMsg(signInError(e));
  }
});

// Local development only: sign in as any email, no password.
$("#login-dev-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = e.target.email.value.trim();
  if (!email.includes("@")) return loginMsg("Enter your email address");
  auth.devToken = `dev:${email}`;
  try {
    localStorage.setItem("adpilot_dev_token", auth.devToken);
  } catch {}
  boot();
});
$("#logout").addEventListener("click", async () => {
  if (auth.mode === "firebase") await auth.sdk.signOut(auth.fb);
  auth.devToken = null;
  try {
    localStorage.removeItem("adpilot_dev_token");
  } catch {}
  location.href = "/"; // back to the Sarthavaha home page
});

const views = {};
async function render() {
  document.querySelectorAll("#nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === state.view);
    a.href = `#${a.dataset.view}`;
  });
  // The sidebar summary refreshes alongside the page's own requests (each round trip is slow from far
  // away), so pages render with the last summary and the sidebar updates when the new one arrives.
  const fresh = api("/summary").then(applySummary);
  const summary = state.summary || (await fresh);
  await Promise.all([(views[state.view] || views.dashboard)($("#main"), summary), fresh]);
}

function applySummary(summary) {
  state.summary = summary;
  const { billing } = summary;
  state.billing = billing;
  state.ai = summary.ai;
  const plan = $("#plan-pill");
  plan.textContent = billing.subscribed ? `Pro · ${billing.plan === "yearly" ? "Yearly" : "Monthly"}` : `Free · ${billing.freeRemaining} of ${billing.freeCampaigns} left`;
  plan.classList.toggle("on", billing.subscribed);
  const pending = summary.pendingApprovals;
  $("#approval-badge").textContent = pending;
  $("#approval-badge").classList.toggle("hidden", !pending);
  const pill = $("#autopilot-pill");
  pill.textContent = summary.autopilot ? "Autopilot ON" : "Approval mode";
  pill.classList.toggle("on", summary.autopilot);
  return summary;
}

// ---------- dashboard ----------
views.dashboard = async (el) => {
  const d = await api("/dashboard");
  const t = d.totals;
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Dashboard</h1><div class="muted">Today across ${d.connections} connected account${d.connections === 1 ? "" : "s"} · monitor ${
        d.monitor.lastRunAt ? `last ran ${ago(d.monitor.lastRunAt)}` : "has not run yet"
      }</div></div>
      <div class="row"><button class="btn" id="run-monitor">Run monitor now</button><a class="btn primary" href="#agent">Ask the agent</a></div>
    </div>
    <div class="grid kpis">
      ${kpi("Spend today", money(t.spend), `${money(d.activeBudget)} active daily budget`)}
      ${kpi("Impressions", int(t.impressions))}
      ${kpi("Clicks", int(t.clicks), `CTR ${pct(t.impressions ? t.clicks / t.impressions : null)}`)}
      ${kpi("Conversions", int(t.conversions), `CPA ${t.conversions ? money(t.spend / t.conversions) : "—"}`)}
      ${kpi("Active campaigns", `${d.active}<span class="muted" style="font-size:16px"> / ${d.campaigns}</span>`, d.pendingApprovals ? `<a href="#approvals">${d.pendingApprovals} awaiting approval</a>` : "No pending approvals")}
    </div>
    <div class="grid two">
      <div class="card"><h2>Total spend today</h2><div id="chart" class="chart"></div></div>
      <div class="card"><h2>Recent activity</h2>${feed(d.recent)}</div>
    </div>`;
  $("#run-monitor").onclick = () => act(() => api("/monitor/run", { body: {} }), "Monitor run complete");
  lineChart($("#chart"), d.series);
};
const kpi = (label, value, sub = "") => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
const feed = (items) =>
  items.length
    ? `<ul class="feed">${items.map((a) => `<li><time>${ago(a.at)}</time><span class="t-${a.type}">${esc(a.message)}</span></li>`).join("")}</ul>`
    : `<div class="empty">No activity yet.</div>`;

function lineChart(el, series) {
  if (series.length < 2) {
    el.innerHTML = `<div class="empty">Spend over time appears once the monitor has collected a few data points from active campaigns.</div>`;
    return;
  }
  const W = el.clientWidth || 600, H = 220, P = { l: 48, r: 12, t: 10, b: 24 };
  const xs = series.map((p) => p.at), ys = series.map((p) => p.spend);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), yMax = Math.max(...ys) * 1.1 || 1;
  const x = (v) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / yMax) * (H - P.t - P.b);
  const pts = series.map((p) => `${x(p.at).toFixed(1)},${y(p.spend).toFixed(1)}`);
  const ticks = [0, 0.5, 1].map((f) => yMax * f);
  const time = (v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Total spend today over time">
    <g class="axis">${ticks
      .map((v) => `<line class="gridline" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${money(v)}</text>`)
      .join("")}
      <text x="${P.l}" y="${H - 6}">${time(x0)}</text><text x="${W - P.r}" y="${H - 6}" text-anchor="end">${time(x1)}</text></g>
    <path class="area" d="M${pts[0]} L${pts.join(" L")} L${x(x1)},${y(0)} L${x(x0)},${y(0)} Z"/>
    <polyline class="line" points="${pts.join(" ")}"/>
    <line class="cross hidden" y1="${P.t}" y2="${H - P.b}"/><circle class="dot hidden" r="5"/>
    <rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/>
  </svg><div class="tooltip hidden"></div>`;
  const svg = $("svg", el), tip = $(".tooltip", el), cross = $(".cross", el), dot = $(".dot", el);
  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    const p = series.reduce((a, b) => (Math.abs(x(b.at) - mx) < Math.abs(x(a.at) - mx) ? b : a));
    const px = x(p.at), py = y(p.spend);
    cross.setAttribute("x1", px); cross.setAttribute("x2", px);
    dot.setAttribute("cx", px); dot.setAttribute("cy", py);
    [cross, dot, tip].forEach((n) => n.classList.remove("hidden"));
    tip.innerHTML = `${time(p.at)} · <b>${money(p.spend)}</b>`;
    tip.style.left = `${(px / W) * r.width}px`;
    tip.style.top = `${(py / H) * r.height}px`;
  });
  svg.addEventListener("pointerleave", () => [cross, dot, tip].forEach((n) => n.classList.add("hidden")));
}

// ---------- campaigns ----------
views.campaigns = async (el, { billing }) => {
  const [campaigns, connections] = await Promise.all([api("/campaigns"), api("/connections")]);
  const connName = Object.fromEntries(connections.map((c) => [c.id, c.accountInfo?.accountName || c.name]));
  el.innerHTML = `
    ${
      !billing.subscribed && billing.freeRemaining === 0
        ? `<div class="banner"><span>You've used your ${billing.freeCampaigns} free campaigns. Subscribe to create more on Meta, Google and TikTok (Sandbox stays free).</span><a class="btn primary small" href="#billing">See plans</a></div>`
        : ""
    }
    <div class="page-head">
      <div><h1>Campaigns</h1><div class="muted">Created paused. Launch from here or let the agent do it.</div></div>
      <button class="btn primary" id="new-campaign" ${connections.length ? "" : "disabled"}>New campaign</button>
    </div>
    <div class="card table-wrap">${
      campaigns.length
        ? `<table><thead><tr><th>Campaign</th><th>Account</th><th>Status</th><th class="num">Budget/day</th><th class="num">Spend</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">CPC</th><th class="num">Conv.</th><th class="num">CPA</th><th></th></tr></thead><tbody>
        ${campaigns
          .map((c) => {
            const m = c.metrics || {};
            return `<tr data-id="${c.id}">
              <td><b>${esc(c.name)}</b><div class="muted" style="font-size:12px">${esc(c.objective)} · ${esc(c.externalId)}</div></td>
              <td><span class="tag">${esc(c.platform)}</span> ${esc(connName[c.connectionId] || "")}</td>
              <td><span class="status ${c.status}">${c.status}</span></td>
              <td class="num">${money(c.dailyBudget)}</td><td class="num">${money(m.spend)}</td><td class="num">${int(m.impressions)}</td>
              <td class="num">${pct(m.ctr)}</td><td class="num">${m.clicks ? money(m.cpc) : "—"}</td><td class="num">${int(m.conversions)}</td>
              <td class="num">${m.conversions ? money(m.cpa) : "—"}</td>
              <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
                ${c.status === "active" ? `<button class="btn small" data-a="pause">Pause</button>` : `<button class="btn small primary" data-a="launch">Launch</button>`}
                <button class="btn small" data-a="budget">Budget</button><button class="btn small" data-a="refresh">Refresh</button>
                <button class="btn small ghost danger" data-a="remove" title="Stop tracking">✕</button></div></td></tr>`;
          })
          .join("")}</tbody></table>`
        : `<div class="empty">${connections.length ? "No campaigns yet. Create one, sync existing ones from Connections, or ask the agent." : 'Connect an ad platform first in <a href="#connections">Connections</a>.'}</div>`
    }</div>`;
  $("#new-campaign").onclick = () => campaignForm(connections);
  el.querySelectorAll("tr[data-id] button").forEach((b) => {
    const id = b.closest("tr").dataset.id;
    const c = campaigns.find((x) => x.id === id);
    b.onclick = () => {
      const a = b.dataset.a;
      if (a === "launch" && confirm(`Launch "${c.name}"? It will start spending up to ${money(c.dailyBudget)}/day.`))
        act(() => api(`/campaigns/${id}/launch`, { body: {} }), "Campaign launched");
      if (a === "pause") act(() => api(`/campaigns/${id}/pause`, { body: {} }), "Campaign paused");
      if (a === "refresh") act(() => api(`/campaigns/${id}/refresh`, { body: {} }), "Metrics refreshed");
      if (a === "remove" && confirm(`Stop tracking "${c.name}" in AdPilot? It is not deleted on the platform.`))
        act(() => api(`/campaigns/${id}`, { method: "DELETE" }), "Removed");
      if (a === "budget") {
        const v = prompt("New daily budget", c.dailyBudget);
        if (v) act(() => api(`/campaigns/${id}/budget`, { body: { dailyBudget: Number(v) } }), "Budget updated");
      }
    };
  });
};

function campaignForm(connections) {
  modal(
    `<h2>New campaign</h2>
    <form class="form" id="cf">
      <label>Ad account<select name="connectionId">${connections
        .map((c) => `<option value="${c.id}">${esc(c.accountInfo?.accountName || c.name)} (${c.platform})</option>`)
        .join("")}</select></label>
      <label>Name<input name="name" required placeholder="Diwali Sale — Traffic — IN" /></label>
      <div class="form-2">
        <label>Objective<select name="objective">${["traffic", "sales", "leads", "awareness", "engagement", "app_installs"]
          .map((o) => `<option>${o}</option>`)
          .join("")}</select></label>
        <label>Daily budget<input name="dailyBudget" type="number" min="1" step="0.01" required value="20" /></label>
        <label>Countries<input name="countries" placeholder="US, IN" /><span class="help">Comma-separated ISO codes</span></label>
        <div class="form-2"><label>Age min<input name="ageMin" type="number" value="18" /></label><label>Age max<input name="ageMax" type="number" value="65" /></label></div>
      </div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn primary">Create (paused)</button></div>
    </form>`,
    (m) => {
      $("#cancel", m).onclick = closeModal;
      $("#cf", m).onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        f.countries = f.countries.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
        f.ageMin = Number(f.ageMin);
        f.ageMax = Number(f.ageMax);
        const r = await act(() => api("/campaigns", { body: f }), (r) => r.warning || "Campaign created (paused)");
        if (r) closeModal();
      };
    },
  );
}

// ---------- approvals ----------
views.approvals = async (el, { autopilot }) => {
  const approvals = await api("/approvals");
  el.innerHTML = `
    <div class="page-head"><div><h1>Approvals</h1><div class="muted">${
      autopilot
        ? "Autopilot is ON — the agent launches and raises budgets on its own (within caps)."
        : "The agent needs your approval to launch campaigns or increase budgets. Pausing never waits."
    }</div></div></div>
    <div class="card table-wrap">${
      approvals.length
        ? `<table><thead><tr><th>Requested</th><th>Action</th><th>Campaign</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${approvals
            .map(
              (a) => `<tr data-id="${a.id}"><td>${ago(a.createdAt)}<div class="muted" style="font-size:12px">${esc(a.requestedBy)}</div></td>
              <td><b>${esc(a.action.replace("_", " "))}</b>${a.params.dailyBudget ? ` → ${money(a.params.dailyBudget)}/day` : ""}</td>
              <td>${esc(a.campaignName)}</td><td style="max-width:320px">${esc(a.reason)}${a.error ? `<div class="error">${esc(a.error)}</div>` : ""}</td>
              <td><span class="status ${a.status}">${a.status}</span></td>
              <td>${a.status === "pending" ? `<div class="row" style="flex-wrap:nowrap"><button class="btn small primary" data-a="approve">Approve</button><button class="btn small" data-a="reject">Reject</button></div>` : ""}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : `<div class="empty">No approval requests yet.</div>`
    }</div>`;
  el.querySelectorAll("button[data-a]").forEach((b) => {
    const id = b.closest("tr").dataset.id;
    b.onclick = () => act(() => api(`/approvals/${id}/${b.dataset.a}`, { body: {} }), (r) => `Request ${r.status}`);
  });
};

// ---------- rules ----------
views.rules = async (el) => {
  const [rules, campaigns, settings] = await Promise.all([api("/rules"), api("/campaigns"), api("/settings")]);
  const cname = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));
  el.innerHTML = `
    <div class="page-head"><div><h1>Monitor rules</h1><div class="muted">Checked every ${settings.monitorIntervalMinutes} min against today's metrics of active campaigns. Each rule fires at most once per campaign per day.</div></div>
      <button class="btn primary" id="new-rule">New rule</button></div>
    <div class="card table-wrap">${
      rules.length
        ? `<table><thead><tr><th>Rule</th><th>Applies to</th><th>Condition</th><th>Action</th><th>Enabled</th><th></th></tr></thead><tbody>${rules
            .map(
              (r) => `<tr data-id="${r.id}"><td>${esc(r.name)}</td><td>${r.campaignId ? esc(cname[r.campaignId] || r.campaignId) : "All campaigns"}</td>
              <td><code>${r.metric} ${r.op} ${r.value}${r.metric === "ctr" ? "%" : ""}</code>${r.minSpend ? ` <span class="muted">after ${money(r.minSpend)} spend</span>` : ""}</td>
              <td><span class="tag">${r.action}</span></td>
              <td><input type="checkbox" data-a="toggle" ${r.enabled ? "checked" : ""} style="width:auto" /></td>
              <td><button class="btn small ghost danger" data-a="delete">Delete</button></td></tr>`,
            )
            .join("")}</tbody></table>`
        : `<div class="empty">No rules yet. Example: pause any campaign when CPA &gt; 25 after 50 spend.</div>`
    }</div>`;
  el.querySelectorAll("[data-a]").forEach((n) => {
    const id = n.closest("tr").dataset.id;
    if (n.dataset.a === "toggle") n.onchange = () => act(() => api(`/rules/${id}`, { method: "PATCH", body: { enabled: n.checked } }));
    else n.onclick = () => act(() => api(`/rules/${id}`, { method: "DELETE" }), "Rule deleted");
  });
  $("#new-rule").onclick = () =>
    modal(
      `<h2>New monitor rule</h2><form class="form" id="rf">
        <label>Name<input name="name" placeholder="Pause expensive conversions" /></label>
        <label>Applies to<select name="campaignId"><option value="">All campaigns</option>${campaigns
          .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
          .join("")}</select></label>
        <div class="form-2">
          <label>Metric<select name="metric">${["cpa", "cpc", "ctr", "spend", "clicks", "impressions", "conversions"].map((m) => `<option>${m}</option>`).join("")}</select><span class="help">CTR in percent: 1 = 1%</span></label>
          <div class="form-2"><label>Operator<select name="op"><option>&gt;</option><option>&lt;</option></select></label><label>Value<input name="value" type="number" step="any" required /></label></div>
          <label>Action<select name="action"><option value="alert">Alert only</option><option value="pause">Pause campaign</option></select></label>
          <label>Minimum spend<input name="minSpend" type="number" step="any" value="0" /><span class="help">Wait for enough data</span></label>
        </div>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn primary">Create rule</button></div></form>`,
      (m) => {
        $("#cancel", m).onclick = closeModal;
        $("#rf", m).onsubmit = async (e) => {
          e.preventDefault();
          if (await act(() => api("/rules", { body: Object.fromEntries(new FormData(e.target)) }), "Rule created")) closeModal();
        };
      },
    );
};

// ---------- connections ----------
const PLATFORM_INFO = {
  meta: { name: "Meta", sub: "Facebook & Instagram ads" },
  google: { name: "Google Ads", sub: "Search, Display & YouTube" },
  tiktok: { name: "TikTok", sub: "TikTok for Business" },
  sandbox: { name: "Sandbox", sub: "Simulated ads, no real spend" },
};

views.connections = async (el) => {
  const connections = await api("/connections");
  const soon = (d) => d && new Date(d) - Date.now() < 10 * 864e5;
  el.innerHTML = `
    <div class="page-head"><div><h1>Connections</h1><div class="muted">Sign in to your ad platforms. AdPilot never asks for API keys: access tokens come from the platform's own sign-in, are encrypted at rest (AES-256-GCM) and never sent back to the browser.</div></div></div>
    <div class="grid connect-grid" style="margin-bottom:24px">${state.platforms
      .map((p) => {
        const info = PLATFORM_INFO[p.id] || { name: p.label, sub: "" };
        const action =
          p.id === "sandbox"
            ? `<button class="btn" data-connect="sandbox">Add sandbox account</button>`
            : p.configured
              ? `<button class="btn primary" data-connect="${p.id}">Connect with ${esc(info.name)}</button>`
              : `<button class="btn" disabled title="The site owner needs to add this platform's app credentials">Coming soon</button>`;
        return `<div class="card connect-card"><span class="platform-mark ${p.id}" aria-hidden="true">${esc(info.name[0])}</span>
          <div><b>${esc(info.name)}</b><div class="muted small-text">${esc(info.sub)}</div></div>${action}</div>`;
      })
      .join("")}</div>
    <h2>Connected accounts</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${
      connections.length
        ? connections
            .map(
              (c) => `<div class="card" data-id="${c.id}"><div class="row" style="justify-content:space-between"><b>${esc(c.accountInfo?.accountName || c.name)}</b><span class="tag">${esc(PLATFORM_INFO[c.platform]?.name || c.platform)}</span></div>
              <div class="muted" style="font-size:12px;margin:6px 0 12px">${c.accountId ? `Account ${esc(c.accountId)} · ` : ""}${esc(c.accountInfo?.currency || "")} · connected ${ago(c.createdAt)}${
                soon(c.tokenExpiresAt)
                  ? `<br><span class="error">Access ${new Date(c.tokenExpiresAt) < new Date() ? "expired" : "expires " + new Date(c.tokenExpiresAt).toLocaleDateString()}. Click Connect with ${esc(PLATFORM_INFO[c.platform]?.name || "")} again to renew.</span>`
                  : ""
              }</div>
              <div class="row"><button class="btn small" data-a="test">Test</button><button class="btn small" data-a="sync">Import campaigns</button><button class="btn small ghost danger" data-a="remove">Disconnect</button></div></div>`,
            )
            .join("")
        : `<div class="card empty">No accounts connected yet. Connect an ad platform above, or add the Sandbox to try everything without spending money.</div>`
    }</div>`;
  el.querySelectorAll("[data-a]").forEach((b) => {
    const id = b.closest("[data-id]").dataset.id;
    b.onclick = () => {
      if (b.dataset.a === "test") act(() => api(`/connections/${id}/test`, { body: {} }), (r) => `OK — ${r.accountName || "connected"}`);
      if (b.dataset.a === "sync") act(() => api(`/connections/${id}/sync`, { body: {} }), (r) => `Imported ${r.total} campaigns (${r.added} new)`);
      if (b.dataset.a === "remove" && confirm("Disconnect this account? Its campaigns stop being tracked (nothing is deleted on the platform)."))
        act(() => api(`/connections/${id}`, { method: "DELETE" }), "Disconnected");
    };
  });
  el.querySelectorAll("[data-connect]").forEach((b) => (b.onclick = () => connectPlatform(b.dataset.connect, b)));
};

async function connectPlatform(platform, btn) {
  if (platform === "sandbox") return act(() => api("/connections", { body: { platform: "sandbox" } }), "Sandbox account added");
  btn.disabled = true;
  try {
    const { url } = await api(`/oauth/${platform}/start`, { body: {} });
    location.href = url; // the platform's own sign-in and permission screen
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
  }
}

/** After the platform redirects back: pick which ad accounts to connect. */
async function handleOAuthReturn() {
  const q = new URLSearchParams(location.search);
  const error = q.get("oauth_error");
  const returned = q.get("oauth");
  if (!error && !returned) return;
  history.replaceState(null, "", location.pathname + location.hash); // don't re-run on refresh
  if (error) return toast(error, true);
  const pending = await api("/oauth/pending").catch(() => null);
  if (!pending?.accounts) return toast("That sign-in has expired. Please click Connect again.", true);
  modal(
    `<h2>Choose ${esc(pending.label)} ad accounts</h2>
    <p class="muted">AdPilot will be able to create, launch, pause and monitor campaigns in the accounts you select.</p>
    <form class="form" id="pick">
      ${pending.accounts
        .map(
          (a, i) =>
            `<label class="check"><input type="checkbox" name="acct" value="${esc(a.id)}" ${i === 0 ? "checked" : ""} /> ${esc(a.name)} <span class="muted small-text">${esc(a.id)}${a.currency ? " · " + esc(a.currency) : ""}</span></label>`,
        )
        .join("")}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn primary">Connect selected</button></div>
    </form>`,
    (m) => {
      $("#cancel", m).onclick = () => (api("/oauth/cancel", { body: {} }).catch(() => {}), closeModal());
      $("#pick", m).onsubmit = async (e) => {
        e.preventDefault();
        const accountIds = [...e.target.querySelectorAll("input[name=acct]:checked")].map((i) => i.value);
        if (!accountIds.length) return toast("Choose at least one ad account", true);
        $("button.primary", m).disabled = true;
        const r = await act(
          () => api("/oauth/finish", { body: { accountIds } }),
          (r) => `Connected ${r.connected.length} account${r.connected.length === 1 ? "" : "s"}${r.failed.length ? `; ${r.failed.length} failed: ${r.failed[0].error}` : ""}`,
        );
        if (r) closeModal();
        else $("button.primary", m).disabled = false;
      };
    },
  );
}

// ---------- activity ----------
views.activity = async (el) => {
  const items = await api("/activity");
  el.innerHTML = `<div class="page-head"><div><h1>Activity</h1><div class="muted">Everything the agent, the monitor and you have done.</div></div></div><div class="card">${feed(items)}</div>`;
};

// ---------- billing ----------
views.billing = async (el, { billing: b, ai }) => {
  const aiPct = Math.min(100, Math.round((ai.costUsd / ai.monthlyUsd) * 100) || 0);
  const used = Math.min(b.campaignsCreated, b.freeCampaigns);
  const until = b.currentPeriodEnd ? new Date(b.currentPeriodEnd).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "";
  const planCard = (key, per) => {
    const p = b.plans[key];
    const current = b.subscribed && b.plan === key;
    return `<div class="card plan${current ? " current" : ""}">
      <b>${p.label}</b>
      <div class="price">${inr(p.amountInr)} <small>/ ${per}</small></div>
      <div class="muted">Unlimited campaigns on every connected platform, AI agent, monitoring and approvals.</div>
      <div style="margin-top:auto">${
        current
          ? `<span class="status active">Your plan</span>`
          : `<button class="btn primary" data-plan="${key}" ${b.subscribed || !b.paymentsEnabled ? "disabled" : ""}>Subscribe ${p.label.toLowerCase()}</button>`
      }</div></div>`;
  };
  el.innerHTML = `
    <div class="page-head"><div><h1>Billing</h1><div class="muted">Your first ${b.freeCampaigns} campaigns are free. Sandbox campaigns never count.</div></div></div>
    <div class="card" style="margin-bottom:16px">${
      b.subscribed
        ? `<h2>Pro · ${b.plan === "yearly" ? "Yearly" : "Monthly"}</h2>
           <div class="muted">Status: ${esc(b.status)}${until ? ` · current period ends ${until}` : ""}</div>
           <div class="row" style="margin-top:12px"><button class="btn danger" id="cancel-sub">Cancel subscription</button>
           <span class="muted small-text">You keep access until the end of the paid period.</span></div>`
        : `<h2>Free plan</h2>
           <div class="muted" style="margin-bottom:8px">${used} of ${b.freeCampaigns} free campaigns used</div>
           <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${b.freeCampaigns}" aria-valuenow="${used}"><span style="width:${(used / b.freeCampaigns) * 100}%"></span></div>`
    }</div>
    <div class="card" style="margin-bottom:16px">
      <h2>AI agent usage</h2>
      <div class="muted" style="margin-bottom:8px">${aiPct}% of this month's allowance used · ${ai.messagesToday} of ${ai.dailyMessages} messages today</div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${aiPct}"><span style="width:${aiPct}%"></span></div>
      ${ai.tier === "free" ? `<p class="muted small-text" style="margin-top:8px">Subscribers get a 10× larger monthly allowance.</p>` : ""}
    </div>
    <div class="plans">${planCard("monthly", "month")}${planCard("yearly", "year")}</div>
    ${b.paymentsEnabled ? "" : `<p class="error">Payments aren't configured on the server yet (Razorpay keys missing).</p>`}
    <p class="muted small-text" style="margin-top:12px">Payments are processed securely by Razorpay (UPI, cards, netbanking). Subscriptions renew automatically until cancelled.</p>`;
  el.querySelectorAll("[data-plan]").forEach((btn) => (btn.onclick = () => startCheckout(btn.dataset.plan, btn)));
  const cancelBtn = $("#cancel-sub");
  if (cancelBtn)
    cancelBtn.onclick = () =>
      confirm("Cancel your subscription? You keep access until the end of the current billing period.") &&
      act(() => api("/billing/cancel", { body: {} }), "Subscription will end at the close of this billing period");
};

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = Object.assign(document.createElement("script"), { src, onload: resolve, onerror: () => reject(new Error("Could not load Razorpay")) });
    document.head.append(el);
  });

async function startCheckout(plan, btn) {
  btn.disabled = true;
  try {
    const { subscriptionId, keyId } = await api("/billing/subscribe", { body: { plan } });
    await loadScript("https://checkout.razorpay.com/v1/checkout.js");
    const rzp = new window.Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: "AdPilot",
      description: `${state.billing.plans[plan].label} plan`,
      prefill: { email: state.me.email },
      theme: { color: "#2a78d6" },
      handler: (resp) => act(() => api("/billing/verify", { body: resp }), "Payment successful. Welcome to Pro!"),
      modal: { ondismiss: () => (btn.disabled = false) },
    });
    rzp.on("payment.failed", (r) => toast(r.error?.description || "Payment failed", true));
    rzp.open();
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
  }
}

// ---------- settings ----------
views.settings = async (el) => {
  const s = await api("/settings");
  el.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><div class="muted">Guardrails apply to every action — yours, the agent's and the monitor's.</div></div></div>
    <form class="card form" id="sf" style="max-width:640px">
      <label class="check"><input type="checkbox" name="autopilot" ${s.autopilot ? "checked" : ""} /> Autopilot — let the agent launch campaigns and raise budgets without approval</label>
      <label class="check"><input type="checkbox" name="aiReviewEnabled" ${s.aiReviewEnabled ? "checked" : ""} /> Hourly AI performance review (uses Claude API credits)</label>
      <div class="form-2">
        <label>Max daily budget per campaign<input type="number" step="any" name="maxCampaignDailyBudget" value="${s.maxCampaignDailyBudget}" /></label>
        <label>Max total active daily budget<input type="number" step="any" name="maxTotalDailyBudget" value="${s.maxTotalDailyBudget}" /></label>
        <label>Monitor interval (minutes)<input type="number" min="1" name="monitorIntervalMinutes" value="${s.monitorIntervalMinutes}" /></label>
      </div>
      <div><button class="btn primary">Save settings</button></div>
      ${state.me.agentReady ? "" : `<p class="error">ANTHROPIC_API_KEY is not set on the server, so the AI agent is unavailable.</p>`}
    </form>`;
  $("#sf").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.autopilot.checked && !s.autopilot && !confirm("Enable autopilot? The agent will be able to launch campaigns and spend money without asking (within the caps)."))
      return;
    act(
      () =>
        api("/settings", {
          method: "PUT",
          body: {
            autopilot: f.autopilot.checked,
            aiReviewEnabled: f.aiReviewEnabled.checked,
            maxCampaignDailyBudget: f.maxCampaignDailyBudget.value,
            maxTotalDailyBudget: f.maxTotalDailyBudget.value,
            monitorIntervalMinutes: f.monitorIntervalMinutes.value,
          },
        }),
      "Settings saved",
    );
  };
};

// ---------- agent ----------
const SUGGESTIONS = [
  "Create a traffic campaign on the sandbox for a sneaker brand at 30/day targeting IN, ages 18-34, then launch it.",
  "How are my campaigns performing today? Pause anything clearly wasting money.",
  "Set up monitoring: alert me if CTR drops below 0.8% and pause any campaign with CPA above 40 after 60 spend.",
  "Import my existing campaigns from every connected account and summarise them.",
];

views.agent = async (el) => {
  const convos = await api("/conversations");
  if (!state.convoId || !convos.find((c) => c.id === state.convoId)) state.convoId = convos[0]?.id || null;
  const convo = state.convoId ? await api(`/conversations/${state.convoId}`) : { items: [] };
  el.innerHTML = `
    <div class="page-head"><div><h1>AI Agent</h1><div class="muted">Describe what you want — the agent plans, creates, launches and monitors campaigns through your connected accounts.</div></div></div>
    <div class="agent">
      <div class="card convos"><button class="btn small" id="new-convo" style="width:100%;margin-bottom:8px">+ New conversation</button>
        ${convos.map((c) => `<a data-id="${c.id}" class="${c.id === state.convoId ? "active" : ""}" title="${esc(c.title)}">${esc(c.title)}</a>`).join("")}</div>
      <div class="card chat">
        <div class="messages" id="messages">${
          convo.items.length
            ? convo.items.map(renderItem).join("") + (convo.running ? `<div class="typing">Agent is working</div>` : "") + (convo.error ? `<div class="error">${esc(convo.error)}</div>` : "")
            : `<div class="empty">${state.me.agentReady ? "Try one of these:" : "Set ANTHROPIC_API_KEY on the server to enable the agent."}<div class="suggestions">${SUGGESTIONS.map(
                (s) => `<button class="btn small" data-s="${esc(s)}">${esc(s.length > 70 ? s.slice(0, 70) + "…" : s)}</button>`,
              ).join("")}</div></div>`
        }</div>
        <form class="composer" id="composer"><textarea ${state.me.agentReady ? "" : "disabled"} name="text" placeholder="e.g. Launch a $50/day sales campaign on Meta for our summer collection in US & CA" required></textarea><button class="btn primary" ${state.me.agentReady ? "" : "disabled"}>Send</button></form>
      </div>
    </div>`;
  const box = $("#messages");
  box.scrollTop = box.scrollHeight;
  if (convo.running && !state.busy) {
    state.busy = true;
    waitForAgent(convo.id).finally(() => ((state.busy = false), render()));
  }
  $("#new-convo").onclick = async () => {
    state.convoId = (await api("/conversations", { body: {} })).id;
    render();
  };
  el.querySelectorAll(".convos a").forEach((a) => (a.onclick = () => ((state.convoId = a.dataset.id), render())));
  el.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => send(b.dataset.s)));
  const ta = $("#composer textarea");
  if (state.pendingPrompt) {
    ta.value = state.pendingPrompt; // from the home page; the user reviews it and presses Send
    state.pendingPrompt = null;
    ta.focus();
  }
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#composer").requestSubmit();
    }
  };
  $("#composer").onsubmit = (e) => {
    e.preventDefault();
    if (ta.value.trim()) send(ta.value.trim());
  };
};

async function send(text) {
  if (state.busy) return;
  state.busy = true;
  try {
    if (!state.convoId) state.convoId = (await api("/conversations", { body: {} })).id;
    const box = $("#messages");
    if (box.querySelector(".empty")) box.innerHTML = "";
    box.insertAdjacentHTML("beforeend", renderItem({ role: "user", text }) + `<div class="typing">Agent is working</div>`);
    box.scrollTop = box.scrollHeight;
    $("#composer textarea").value = "";
    $("#composer button").disabled = true;
    await api(`/conversations/${state.convoId}/messages`, { body: { text } });
    await waitForAgent(state.convoId);
  } catch (e) {
    toast(e.message, true);
  } finally {
    state.busy = false;
    render();
  }
}

// Agent turns run in the background; poll and show progress until the turn ends.
async function waitForAgent(convoId) {
  for (;;) {
    await new Promise((r) => setTimeout(r, document.visibilityState === "visible" ? 3000 : 10000));
    const convo = await api(`/conversations/${convoId}`);
    const box = $("#messages");
    if (box && state.view === "agent" && state.convoId === convoId) {
      box.innerHTML = convo.items.map(renderItem).join("") + (convo.running ? `<div class="typing">Agent is working</div>` : "");
      box.scrollTop = box.scrollHeight;
    }
    if (!convo.running) {
      if (convo.error) toast(`Agent error: ${convo.error}`, true);
      return;
    }
  }
}

function renderItem(it) {
  if (it.role === "tool") {
    return `<details class="tool${it.error ? " err" : ""}"><summary>${it.error ? "⚠" : "⚙"} ${esc(it.name)}(${esc(
      Object.entries(it.input || {})
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ")
        .slice(0, 120),
    )})</summary>${it.result ? `<pre>${esc(it.result)}</pre>` : ""}</details>`;
  }
  return `<div class="msg ${it.role}">${it.role === "assistant" ? md(it.text) : esc(it.text)}</div>`;
}

// Minimal, safe markdown: escape first, then format.
function md(src) {
  const lines = esc(src).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const cells = (l) => l.trim().slice(1, -1).split("|").map((c) => inline(c.trim()));
      const head = cells(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`);
    } else if (/^#{1,4}\s/.test(lines[i])) out.push(`<b>${inline(lines[i].replace(/^#+\s/, ""))}</b>`);
    else out.push(inline(lines[i].replace(/^(\s*)[-*]\s/, "$1• ")));
  }
  return out.join("\n").replace(/(<\/div>)\n/g, "$1");
}
const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");

boot().catch((e) => {
  showLogin();
  loginMsg(`The app failed to start: ${e.message}. Please refresh the page.`);
});
