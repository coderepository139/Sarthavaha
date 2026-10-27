export class PlatformError extends Error {
  constructor(platform, message, details) {
    super(`[${platform}] ${message}`);
    this.platform = platform;
    this.details = details;
  }
}

export async function request(platform, url, { method = "GET", headers = {}, body, form } = {}) {
  const init = { method, headers: { ...headers } };
  if (form) {
    init.body = new URLSearchParams(form);
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error?.error_user_msg || json?.message || `HTTP ${res.status}`;
    throw new PlatformError(platform, msg, json);
  }
  return json;
}

export const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
