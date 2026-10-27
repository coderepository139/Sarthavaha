// All /api/* routes: the Express app, bridged from the web Request/Response API
// through serverless-http's Lambda event shape.
import serverless from "serverless-http";
import { runtime } from "../../adpilot/server/store.js";
import { createApp } from "../../adpilot/server/app.js";

runtime.netlify = true;
let handle;

export default async (req) => {
  handle ||= serverless(createApp());
  const url = new URL(req.url);
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const result = await handle(
    {
      httpMethod: req.method,
      path: url.pathname,
      queryStringParameters: Object.fromEntries(url.searchParams),
      headers: {
        host: url.host,
        "x-forwarded-proto": url.protocol.replace(":", ""),
        ...Object.fromEntries(req.headers),
      },
      body: hasBody ? Buffer.from(await req.arrayBuffer()).toString("base64") : null,
      isBase64Encoded: hasBody,
      requestContext: {},
    },
    {},
  );
  const headers = new Headers();
  for (const [k, v] of Object.entries(result.headers || {})) headers.set(k, String(v));
  for (const [k, values] of Object.entries(result.multiValueHeaders || {})) for (const v of values) headers.append(k, String(v));
  const body = result.isBase64Encoded ? Buffer.from(result.body, "base64") : result.body;
  return new Response(body, { status: result.statusCode, headers });
};

export const config = { path: "/api/*" };
