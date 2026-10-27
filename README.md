<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>


# AdPilot console (Netlify + Firebase)

The home page (`/`) is unchanged. **Sign in**, **Open workspace** and **Plan my campaign** open the
AdPilot console at `/console/`: users sign in with Google (Firebase Auth), connect their ad accounts
with **Connect with Meta / Google Ads / TikTok** (OAuth, never pasted API keys), and the AI agent
creates, launches and monitors campaigns. 5 campaigns are free, then ₹999/month or ₹11,988/year (Razorpay).

| Piece | Where |
|---|---|
| Home page | `src/App.tsx` (React, built by Vite) |
| Console UI | `public/console/` (served at `/console/`) |
| API | `netlify/functions/api.mjs` → `adpilot/server/` (Express) |
| AI agent turns | `netlify/functions/agent-background.mjs` (background, up to 15 min) |
| Monitor | `netlify/functions/monitor.mjs` (every 5 min) → `monitor-background.mjs` |
| Data | Firestore (same Firebase project), `adpilot_*` collections only |
| Ad platform OAuth | `adpilot/server/oauth.js` |

## Setup

1. **Firebase** (project `gen-lang-client-0918770499`):
   - Authentication → Sign-in method → enable **Google**.
   - Authentication → Settings → **Authorized domains** → add your Netlify domain (and custom domain).
   - Project settings → Service accounts → **Generate new private key** → use its `client_email` and `private_key`.
2. **Ad platform apps** (one each, owned by you; users only click Connect). Redirect URIs:
   - Meta: `https://YOUR-SITE/api/oauth/meta/callback`. App with Facebook Login for Business and Marketing API; request `ads_management`, `ads_read`, `business_management` (App Review for public use).
   - Google Ads: `https://YOUR-SITE/api/oauth/google/callback`. Google Cloud OAuth client (Web) with scope `https://www.googleapis.com/auth/adwords`, plus a Google Ads **developer token** (Basic access for real accounts).
   - TikTok: `https://YOUR-SITE/api/oauth/tiktok/callback`. TikTok for Business developer app with Ads Management permission.
3. **Netlify** → Environment variables (Functions scope): see the AdPilot section of `.env.example`. Set `PUBLIC_URL` to the exact site URL used in the redirect URIs. Redeploy after changes.
4. **Razorpay** webhook: `https://YOUR-SITE/api/billing/webhook` (subscription.* events).

Platforms without credentials show "Coming soon" in the console; the Sandbox always works.

Local console: `npm run console` → http://localhost:3000/console/ (without Firebase settings it uses
email-only dev sign-in and local files in `adpilot/data/`).

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/98ef481c-033c-4e06-b7b0-2a4519d27365

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
