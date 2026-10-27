// Runs the monitor for one batch of users. Started by the monitor schedule.
import { runtime } from "../../adpilot/server/store.js";
import { sign } from "../../adpilot/server/crypto.js";
import { runAllDue } from "../../adpilot/server/monitor.js";

runtime.netlify = true;

export default async (req) => {
  const { at, baseUrl, users, sig } = await req.json().catch(() => ({}));
  const fresh = Math.abs(Date.now() - Number(at)) < 5 * 60000;
  if (!fresh || !Array.isArray(users) || sig !== sign(`monitor:${at}:${users.join(",")}`)) {
    console.warn("monitor-background: rejected unsigned or stale request");
    return;
  }
  const checked = await runAllDue({ baseUrl, users });
  console.log(`monitor-background: checked ${checked} user(s)`);
};

export const config = { background: true };
