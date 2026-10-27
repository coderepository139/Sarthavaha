import meta from "./meta.js";
import google from "./google.js";
import tiktok from "./tiktok.js";
import sandbox from "./sandbox.js";

export const platforms = { meta, google, tiktok, sandbox };

export function getPlatform(id) {
  const p = platforms[id];
  if (!p) throw new Error(`Unknown platform: ${id}`);
  return p;
}

/** Platforms for the Connections page; `configured` says which OAuth apps the server has credentials for. */
export function describePlatforms(configured = {}) {
  return Object.values(platforms).map(({ id, label, oauth }) => ({ id, label, oauth, configured: oauth ? !!configured[id] : true }));
}
