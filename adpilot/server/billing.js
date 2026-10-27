// Subscriptions via Razorpay: ₹999/month or ₹11,988/year after the free campaigns.
// Docs: https://razorpay.com/docs/api/payments/subscriptions/
import crypto from "node:crypto";
import * as store from "./store.js";
import { memo, forget } from "./db.js";

// One account read per request, however many places ask for it.
export const accountKey = (userId) => `account:${userId}`;
const account = (userId) => memo(accountKey(userId), () => store.getAccount(userId));
async function saveAccount(userId, patch) {
  await store.updateAccount(userId, patch);
  forget(accountKey(userId));
}

export const PLANS = {
  monthly: { label: "Monthly", amount: 99900, period: "monthly", totalCount: 60 }, // amounts in paise
  yearly: { label: "Yearly", amount: 1198800, period: "yearly", totalCount: 5 },
};

export class BillingError extends Error {
  status = 400;
}

const API = () => process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1";
export const billingEnabled = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

async function rzp(pathname, { method = "GET", body } = {}) {
  if (!billingEnabled()) throw new BillingError("Payments are not configured on the server yet");
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API()}${pathname}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay: ${json.error?.description || `HTTP ${res.status}`}`);
  return json;
}

const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex");
const safeEqual = (a, b) => typeof a === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Plan ids from env, else from app_config, else created once in Razorpay and remembered. */
async function planId(plan) {
  const fromEnv = process.env[`RAZORPAY_PLAN_${plan.toUpperCase()}`];
  if (fromEnv) return fromEnv;
  const saved = (await store.getConfig("razorpay_plans")) || {};
  if (saved[plan]) return saved[plan];
  const p = PLANS[plan];
  const created = await rzp("/plans", {
    method: "POST",
    body: { period: p.period, interval: 1, item: { name: `AdPilot ${p.label}`, amount: p.amount, currency: "INR" } },
  });
  await store.setConfig("razorpay_plans", { ...saved, [plan]: created.id });
  return created.id;
}

/** Billing summary shown in the UI. */
export async function summary(userId) {
  const a = await account(userId);
  const subscribed = store.isSubscribed(a);
  return {
    subscribed,
    plan: a.plan,
    status: a.subscriptionStatus,
    currentPeriodEnd: a.currentPeriodEnd,
    campaignsCreated: a.campaignsCreated,
    freeCampaigns: store.FREE_CAMPAIGNS,
    freeRemaining: subscribed ? null : Math.max(0, store.FREE_CAMPAIGNS - a.campaignsCreated),
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { label: p.label, amountInr: p.amount / 100 }])),
    paymentsEnabled: billingEnabled(),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
  };
}

/** Starts a subscription; the browser completes it in Razorpay Checkout. */
export async function subscribe(userId, email, plan) {
  if (!PLANS[plan]) throw new BillingError("Plan must be monthly or yearly");
  const a = await account(userId);
  if (store.isSubscribed(a)) throw new BillingError("You already have an active subscription");
  const sub = await rzp("/subscriptions", {
    method: "POST",
    body: {
      plan_id: await planId(plan),
      total_count: PLANS[plan].totalCount,
      customer_notify: 1,
      notes: { user_id: userId, email: email || "", plan },
    },
  });
  await saveAccount(userId, { email, plan, subscriptionStatus: sub.status, razorpaySubscriptionId: sub.id });
  return { subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID };
}

/** Verifies the Checkout success callback and activates the subscription. */
export async function verifyCheckout(userId, { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }) {
  const a = await account(userId);
  if (!razorpay_subscription_id || razorpay_subscription_id !== a.razorpaySubscriptionId) {
    throw new BillingError("Subscription does not belong to this account");
  }
  const expected = hmac(process.env.RAZORPAY_KEY_SECRET, `${razorpay_payment_id}|${razorpay_subscription_id}`);
  if (!safeEqual(razorpay_signature, expected)) throw new BillingError("Payment signature is invalid");
  const sub = await rzp(`/subscriptions/${razorpay_subscription_id}`);
  await applySubscription(userId, sub, { justPaid: true });
  return summary(userId);
}

/** Cancels at the end of the current billing period, so paid time isn't lost. */
export async function cancel(userId) {
  const a = await account(userId);
  if (!a.razorpaySubscriptionId) throw new BillingError("No subscription to cancel");
  const sub = await rzp(`/subscriptions/${a.razorpaySubscriptionId}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 1 } });
  await applySubscription(userId, sub);
  return summary(userId);
}

async function applySubscription(userId, sub, { justPaid = false } = {}) {
  let end = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;
  // Right after the first payment Razorpay may not have filled current_end yet.
  if (!end && justPaid) {
    const d = new Date();
    if (sub.notes?.plan === "yearly") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    end = d.toISOString();
  }
  await saveAccount(userId, {
    subscriptionStatus: sub.status,
    razorpaySubscriptionId: sub.id,
    ...(sub.notes?.plan && { plan: sub.notes.plan }),
    ...(end && { currentPeriodEnd: end }),
  });
}

/** Razorpay webhook: keeps status and renewal dates in sync (charged, halted, cancelled, ...). */
export async function handleWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new BillingError("Webhook secret not configured");
  if (!safeEqual(signature, hmac(secret, rawBody))) throw new BillingError("Invalid webhook signature");
  const event = JSON.parse(rawBody);
  const sub = event.payload?.subscription?.entity;
  if (!sub) return { ignored: event.event };
  const userId = sub.notes?.user_id || (await store.findUserBySubscription(sub.id));
  if (!userId) return { ignored: "unknown subscription" };
  await applySubscription(userId, sub);
  return { ok: true, event: event.event };
}
