// AES-256-GCM encryption for ad platform credentials at rest.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, backend, isProduction } from "./store.js";

function loadSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  // Serverless functions have no persistent disk, so the secret must come from the environment.
  if (backend === "firestore" || isProduction()) throw new Error("APP_SECRET environment variable is required in production");
  const file = path.join(DATA_DIR, ".secret");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
    console.warn("[adpilot] APP_SECRET not set; generated one in data/.secret");
  }
  return fs.readFileSync(file, "utf8").trim();
}

let key;
const secretKey = () => (key ||= crypto.createHash("sha256").update(loadSecret()).digest());

export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload) {
  const [iv, tag, data] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}

export function sign(value) {
  return crypto.createHmac("sha256", secretKey()).update(value).digest("hex");
}

// Show only the last 4 characters of each secret to the UI.
export function mask(creds) {
  return Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, typeof v === "string" && v.length > 8 ? `••••${v.slice(-4)}` : v]));
}
