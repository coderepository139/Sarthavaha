// Local / self-hosted entry point: a long-running Node server with an in-process monitor timer.
import "dotenv/config";
import { createApp } from "./app.js";
import * as monitor from "./monitor.js";
import { backend } from "./store.js";

const app = createApp();
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`[adpilot] running on http://localhost:${PORT} (storage: ${backend})`);
  if (backend === "file") console.log("[adpilot] Firebase not configured: dev sign-in (email only) is enabled");
  monitor.start();
});
