# Inntena

![Status](https://img.shields.io/badge/status-live-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

**Live demo:** [niche-radar.onrender.com](https://niche-radar.onrender.com)

A free, open-source tool to detect design and aesthetic trends **before they
saturate** marketplaces like Etsy — built for creators of clip art and
AI-generated digital assets.

## Why

Tools like eRank or Alura solve this problem, but they're paid and 
closed source. Inntena offers the essentials: Google Trends search 
volume tracking and rising related searches, multi region comparison, and
a history of everything you've tracked, for free, transparently, and easy
to self host.

## Features

- **Multi-user accounts** — email/password auth (JWT in an httpOnly cookie),
  each user tracks their own independent set of keywords.
- **Trend dashboard** — search volume history and rising related queries per
  keyword, powered by Recharts, with side-by-side comparison across up to 3
  regions at once (plus Worldwide).
- **Keyword history** — archived keywords keep their collected data for a
  configurable retention period (15/30/60/90 days) instead of being deleted
  outright, and can be restored.
- **Automatic daily collection** — a scheduled job (GitHub Actions → a
  protected internal endpoint) pulls fresh Google Trends data every day,
  with built-in rate-limit backoff and a circuit breaker so it degrades
  gracefully instead of getting the server blocked by Google.
- **English/Spanish UI**, light/dark theme, both persisted per browser.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS, React Router, Recharts |
| Backend | TypeScript + Express |
| Auth | bcrypt + JWT in an httpOnly cookie |
| Database | PostgreSQL (Docker Compose locally, [Neon](https://neon.tech) in production) |
| ORM | Drizzle ORM + drizzle-kit |
| Trend data | `google-trends-api` (unofficial, no API key required) |
| Security | Helmet (with an explicit CSP), `express-rate-limit` |
| Deploy | Render (`render.yaml` Blueprint — web service only; the database lives on Neon) |
| Scheduling | GitHub Actions (daily cron, triggers a protected collection endpoint) |
| Optional integration | Etsy Open API v3 (bring your own API key) |

## Getting Started

Want to run your own instance instead of using the [live demo](https://niche-radar.onrender.com)? It's fully self-hostable — your own Docker Postgres, your own secrets, independent from anyone else's copy.

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or higher
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (to run PostgreSQL)

### Setup

1. Clone the repo:
```bash
git clone https://github.com/arambs22/inntena.git
cd inntena
```

2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd client && npm install && cd ..
```

4. Copy the environment variables file:
```bash
cp .env.example .env
```
   Generate values for `JWT_SECRET` and `CRON_SECRET` (each needs to be at
   least 32 characters — anything shorter fails validation on startup):
```bash
openssl rand -base64 48
```
   Run it twice and paste one result into each variable in `.env`.

   `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, and `APP_URL` are also
   optional, same spirit as `ETSY_API_KEY` above — without SendGrid
   credentials, verification/password-reset emails are just logged to the
   console instead of sent, which is fine for local dev. Sent over
   SendGrid's HTTPS API rather than SMTP, since most free-tier hosts
   (including Render) block outbound SMTP ports.

5. Start PostgreSQL with Docker Compose:
```bash
docker compose up -d
```
   This also creates a second, empty `inntena_test` database on the same
   container (via `docker/init-test-db.sql`), used only by the test suite
   below — it never touches your regular `inntena` data.

6. Apply the database schema:
```bash
npm run db:migrate
```

6a. (Optional) Run the test suite:
```bash
cp .env.test.example .env.test
npm test
```
   The tests run against the real `inntena_test` database from step 5
   (migrations included — `npm test` applies them automatically before
   running), not mocks. The frontend has its own, separate suite for
   pure logic (`npm test --prefix client`) — no database needed.

7. Start the backend (hot-reload):
```bash
npm run dev
```

8. In a **second terminal**, start the frontend:
```bash
cd client && npm run dev
```

9. Open **http://localhost:5173** — that's the dashboard. (Vite proxies API
   requests to the backend on port 3000 automatically, so the session
   cookie works in dev without any CORS setup.)

   Optional sanity check on the backend directly:
```bash
curl http://localhost:3000/health
```
```json
   {
     "status": "ok",
     "database": "connected",
     "etsyIntegration": "disabled",
     "timestamp": "2026-08-18T12:00:00.000Z"
   }
```
   `etsyIntegration` shows `"disabled"` unless you've configured an Etsy API
   key in `.env` — that integration is entirely optional, the app works
   fully without it using Google Trends data only.

### Automatic daily collection (optional, for your own deployment)

The live demo collects fresh data once a day via
`.github/workflows/collect-trends.yml`, which calls a `CRON_SECRET`-protected
endpoint on the deployed instance. If you deploy your own copy and want the
same, point that workflow's `NICHERADAR_URL` secret at your instance and set
`CRON_SECRET` to match your `.env`. Locally, you can trigger a one-off
collection yourself instead:
```bash
npm run collect -- --geo=US
```

## Project Status

The core product is complete and live: multi-user auth, the full trend
dashboard (multi-region comparison, keyword history, i18n), hardened and
deployed to production on Render. See the commit history for detailed
progress.

**Next up:** Etsy Open API v3 integration, to cross-reference trending
keywords against real listing counts and measure actual market saturation
(demand vs. supply), not just search volume on its own.

## Roadmap

Ideas that are documented but intentionally **not** built yet:

- **Etsy Open API v3 integration** — cross-reference trending keywords with
  real Etsy listings to measure market saturation. The most valuable of the
  three below; next in line.
- **AI prompt suggestions** — once a trend is detected, suggest generation
  prompts (for tools like Flux/ComfyUI) tailored to that aesthetic.
- **Browser extension** — an overlay directly on Etsy's own pages, similar
  to tools like Everbee, but focused on AI-generated digital product
  sellers specifically (a gap the existing tools in that space don't cover).

## License

[MIT](./LICENSE) © 2026 Aram Barsegyan
