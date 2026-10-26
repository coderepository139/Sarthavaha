/**
 * Cost and load protection for Gemini calls.
 *
 * Three layers, all configurable with environment variables:
 *   1. Per-IP and per-account rate limits, so one person or bot can't hammer the API.
 *   2. A daily cap on AI requests for the whole service (and a lower one for free
 *      users), resetting at midnight India time. Paying users keep working when the
 *      free share runs out.
 *   3. A kill switch (AI_PAUSED=true) to stop all generation instantly.
 *
 * Counters live in memory, per server instance. On Cloud Run, keep max instances low
 * (or move the counter to Firestore/Redis) and rely on the Google-side spend cap as
 * the final backstop. See the launch report for the console settings.
 */
import type { Request, Response, NextFunction } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const AI_LIMITS = {
  dailyCap: num('AI_DAILY_REQUEST_CAP', 4000),
  freeDailyCap: num('AI_FREE_DAILY_REQUEST_CAP', 2500),
  perUserPerMinute: num('AI_PER_USER_PER_MINUTE', 6),
  perIpPerMinute: num('AI_PER_IP_PER_MINUTE', 20),
  authPerIpPer15Min: num('AUTH_PER_IP_PER_15_MIN', 30),
};

const isPaused = () => process.env.AI_PAUSED === 'true';

// ---- Daily counter, reset at midnight IST ----
const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
let day = istDay();
let used = { all: 0, free: 0 };
let alerted = { half: false, ninety: false };

function rollDay() {
  const today = istDay();
  if (today !== day) {
    day = today;
    used = { all: 0, free: 0 };
    alerted = { half: false, ninety: false };
  }
}

export function aiUsageToday() {
  rollDay();
  return { day, ...used, ...AI_LIMITS, paused: isPaused() };
}

function warnIfNeeded() {
  const share = used.all / AI_LIMITS.dailyCap;
  if (share >= 0.9 && !alerted.ninety) {
    alerted.ninety = true;
    console.warn(`[ai-guard] 90% of today's AI request cap used (${used.all}/${AI_LIMITS.dailyCap}).`);
  } else if (share >= 0.5 && !alerted.half) {
    alerted.half = true;
    console.warn(`[ai-guard] 50% of today's AI request cap used (${used.all}/${AI_LIMITS.dailyCap}).`);
  }
}

const busy = (res: Response, message: string, retryAfterSeconds = 600) => {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(503).json({ error: message, busy: true });
};

/** Reserve one AI request against today's caps. Use after authentication and plan checks. */
export function aiBudget(req: Request, res: Response, next: NextFunction) {
  rollDay();
  if (isPaused()) {
    return busy(res, 'Sarthavaha is paused for maintenance. Please try again shortly.');
  }
  const user = (req as any).user as { role?: string; isSubscribed?: boolean } | undefined;
  const isFree = !user?.isSubscribed && user?.role !== 'admin';

  if (used.all >= AI_LIMITS.dailyCap) {
    return busy(res, 'We’re at capacity for today. Please try again after midnight IST.');
  }
  if (isFree && used.free >= AI_LIMITS.freeDailyCap) {
    return busy(res, 'Free generations are busy right now because of high demand. Please try again in a few hours. Pro accounts are not affected.');
  }

  used.all += 1;
  if (isFree) used.free += 1;
  warnIfNeeded();
  next();
}

/** Per-IP limit for AI endpoints (runs before authentication, so bots are cut off cheaply). */
export const aiIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: AI_LIMITS.perIpPerMinute,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests from this network. Please wait a minute and try again.' },
});

/** Per-account limit for AI endpoints (runs after authentication). */
export const aiUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: AI_LIMITS.perUserPerMinute,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ((req as any).user?.id as string | undefined) || ipKeyGenerator(req.ip || ''),
  message: { error: 'You’re going a bit fast. Please wait a minute before the next request.' },
});

/** Sign-in endpoints: slows down credential stuffing and account farming. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: AI_LIMITS.authPerIpPer15Min,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});
