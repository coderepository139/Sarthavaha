// Monitor tick, every 5 minutes (UTC). Scheduled functions stop after 30s, so
// users with active campaigns are split into batches and each batch runs in its
// own monitor-background invocation (up to 15 minutes each).
import { runtime, usersWithActiveCampaigns } from "../../adpilot/server/store.js";
import { sign } from "../../adpilot/server/crypto.js";
import { MONITOR_BATCH } from "../../adpilot/server/monitor.js";

runtime.netlify = true;

export default async (req, context) => {
  const baseUrl = context.site?.url || process.env.URL;
  const users = await usersWithActiveCampaigns();
  const batches = [];
  for (let i = 0; i < users.length; i += MONITOR_BATCH) batches.push(users.slice(i, i + MONITOR_BATCH));
  const results = await Promise.allSettled(
    batches.map((batch) => {
      const at = String(Date.now());
      return fetch(`${baseUrl}/.netlify/functions/monitor-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at, baseUrl, users: batch, sig: sign(`monitor:${at}:${batch.join(",")}`) }),
      });
    }),
  );
  const failed = results.filter((r) => r.status === "rejected" || !r.value.ok).length;
  console.log(`monitor: ${users.length} user(s) in ${batches.length} batch(es)${failed ? `, ${failed} failed to start` : ""}`);
};

export const config = { schedule: "*/5 * * * *" };
