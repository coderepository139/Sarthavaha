// Runs one agent turn (up to 15 minutes). Invoked by the api function with a signed payload.
import { runtime } from "../../adpilot/server/store.js";
import { withUser } from "../../adpilot/server/db.js";
import { runTurn, verifyDispatch } from "../../adpilot/server/agent.js";

runtime.netlify = true;

export default async (req) => {
  const payload = await req.json().catch(() => ({}));
  if (!verifyDispatch(payload)) {
    console.warn("agent-background: rejected unsigned request");
    return;
  }
  // runTurn records its own errors on the conversation, so Netlify won't retry.
  await withUser(payload.userId, () => runTurn(payload.conversationId, payload.actor || "agent"));
};

export const config = { background: true };
