/**
 * Sign-up and activation analytics (Google Analytics 4).
 *
 * - Set VITE_GA_MEASUREMENT_ID (e.g. G-XXXXXXXXXX) at build time to turn GA4 on.
 *   Without it every call below is a no-op, so local development sends nothing.
 * - UTM parameters are captured on the first visit and kept in localStorage, so a
 *   person who arrives from Instagram on Monday and signs up on Wednesday is still
 *   attributed to Instagram. The same attribution is sent to our own server at
 *   sign-up so sources can be counted in the admin panel without GA.
 * - Visitors can opt out from the privacy page (setAnalyticsOptOut).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID: string | undefined = (import.meta as any).env?.VITE_GA_MEASUREMENT_ID;
const ATTRIBUTION_KEY = 'sarthavaha_attribution';
const OPT_OUT_KEY = 'sarthavaha_analytics_opt_out';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export interface Attribution {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
  referrer?: string;
  landingPath?: string;
  firstSeenAt: string;
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: ignore */ }
}

export function isAnalyticsOptedOut(): boolean {
  return safeGet(OPT_OUT_KEY) === 'true';
}

export function setAnalyticsOptOut(optOut: boolean) {
  safeSet(OPT_OUT_KEY, optOut ? 'true' : 'false');
  window.gtag?.('consent', 'update', { analytics_storage: optOut ? 'denied' : 'granted' });
}

/** Best guess at where a visit came from when no UTM tags are present. */
function sourceFromReferrer(referrer: string): { source: string; medium: string } {
  if (!referrer) return { source: '(direct)', medium: '(none)' };
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (host === location.hostname) return { source: '(direct)', medium: '(none)' };
    if (/instagram\./.test(host)) return { source: 'instagram', medium: 'social' };
    if (/(facebook\.|fb\.|m\.facebook)/.test(host)) return { source: 'facebook', medium: 'social' };
    if (/linkedin\.|lnkd\.in/.test(host)) return { source: 'linkedin', medium: 'social' };
    if (/whatsapp\.|wa\.me/.test(host)) return { source: 'whatsapp', medium: 'social' };
    if (/(t\.co|twitter\.|x\.com)/.test(host)) return { source: 'x', medium: 'social' };
    if (/youtube\./.test(host)) return { source: 'youtube', medium: 'social' };
    if (/google\./.test(host)) return { source: 'google', medium: 'organic' };
    if (/bing\./.test(host)) return { source: 'bing', medium: 'organic' };
    return { source: host, medium: 'referral' };
  } catch {
    return { source: '(direct)', medium: '(none)' };
  }
}

/** Instagram/Facebook in-app browsers have no referrer, but say so in the user agent. */
function sourceFromUserAgent(): { source: string; medium: string } | null {
  const ua = navigator.userAgent || '';
  if (/Instagram/i.test(ua)) return { source: 'instagram', medium: 'social' };
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { source: 'facebook', medium: 'social' };
  if (/LinkedInApp/i.test(ua)) return { source: 'linkedin', medium: 'social' };
  return null;
}

/** Record first-touch attribution once per browser. Call on every page load. */
export function captureAttribution(): Attribution {
  const existing = getAttribution();
  const params = new URLSearchParams(location.search);
  const hasUtm = UTM_KEYS.some(k => params.get(k));

  // First touch wins. The one exception: an untagged first visit (source guessed
  // from the referrer) is upgraded the first time the person arrives on a UTM link.
  if (existing && (!hasUtm || existing.campaign !== '(not set)')) return existing;

  const guessed = sourceFromUserAgent() ?? sourceFromReferrer(document.referrer);
  const attribution: Attribution = {
    source: (params.get('utm_source') || guessed.source).toLowerCase().slice(0, 64),
    medium: (params.get('utm_medium') || guessed.medium).toLowerCase().slice(0, 64),
    campaign: (params.get('utm_campaign') || '(not set)').toLowerCase().slice(0, 100),
    content: params.get('utm_content')?.slice(0, 100) || undefined,
    term: params.get('utm_term')?.slice(0, 100) || undefined,
    referrer: document.referrer ? document.referrer.slice(0, 200) : undefined,
    landingPath: location.pathname,
    firstSeenAt: existing?.firstSeenAt || new Date().toISOString(),
  };
  safeSet(ATTRIBUTION_KEY, JSON.stringify(attribution));
  return attribution;
}

export function getAttribution(): Attribution | null {
  const raw = safeGet(ATTRIBUTION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as Attribution; } catch { return null; }
}

let initialised = false;

/** Load gtag.js once. No-op without a measurement ID. */
export function initAnalytics() {
  captureAttribution();
  if (!GA_ID || initialised) return;
  initialised = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag expects the arguments object itself
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('consent', 'default', {
    analytics_storage: isAnalyticsOptedOut() ? 'denied' : 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { anonymize_ip: true });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

function send(event: string, params: Record<string, unknown> = {}) {
  if (!window.gtag) return;
  const a = getAttribution();
  window.gtag('event', event, {
    ...params,
    signup_source: a?.source,
    signup_medium: a?.medium,
    signup_campaign: a?.campaign,
  });
}

export type SignUpMethod = 'google' | 'phone' | 'email';

/** GA4 recommended event. Fire only when an account is newly created. */
export function trackSignUp(method: SignUpMethod, userId?: string) {
  if (userId) window.gtag?.('set', { user_id: userId });
  send('sign_up', { method });
}

export function trackLogin(method: SignUpMethod, userId?: string) {
  if (userId) window.gtag?.('set', { user_id: userId });
  send('login', { method });
}

/** Fires once per account, the first time the agent returns a result. */
export function trackFirstQuery(userId: string, feature = 'unknown') {
  const key = `sarthavaha_first_query_${userId}`;
  if (safeGet(key)) return;
  safeSet(key, new Date().toISOString());
  send('first_query', { feature });
}

export function trackEvent(event: string, params: Record<string, unknown> = {}) {
  send(event, params);
}
