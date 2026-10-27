// Who is calling? Firebase Auth ID tokens (Google sign-in) in production; a dev-only
// "dev:<email>" token when Firebase isn't configured (local development).
import crypto from "node:crypto";
import { backend, isProduction, missingConfig } from "./store.js";
import { firebaseAuth, webConfig } from "./firebase.js";

/**
 * "firebase": normal sign-in. "dev": local email-only sign-in (never in production).
 * "unconfigured": a production deploy missing required settings; nobody can sign in until they're added.
 */
export function authMode() {
  if (isProduction()) return missingConfig().length ? "unconfigured" : "firebase";
  return backend === "firestore" ? "firebase" : "dev";
}

/** Returns { id, email } for the request's bearer token, or null. */
export async function authenticate(req) {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const mode = authMode();
  if (mode === "unconfigured") return null;
  if (mode === "dev") {
    const email = token.startsWith("dev:") ? token.slice(4).trim().toLowerCase() : "";
    if (!email.includes("@")) return null;
    return { id: `dev-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 16)}`, email };
  }
  try {
    // Verified locally against Google's public keys (cached), so this rarely needs a network call.
    const claims = await firebaseAuth().verifyIdToken(token);
    return { id: claims.uid, email: claims.email || claims.phone_number || `${claims.uid}@users.sarthavaha.com` };
  } catch {
    return null;
  }
}

/** Public settings the browser needs to sign users in. */
export const publicConfig = () => ({
  authMode: authMode(),
  // Only names, so the setup screen can say what to add in Netlify.
  ...(authMode() === "unconfigured" && { missing: missingConfig() }),
  // The Firebase web config is public by design; access is enforced by ID tokens and security rules.
  firebase: {
    apiKey: webConfig.apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || webConfig.authDomain,
    projectId: webConfig.projectId,
    appId: webConfig.appId,
  },
});
