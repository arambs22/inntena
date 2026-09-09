# ADR 0001: Overall Architecture

**Status:** Accepted

**Date:** 2026-08-27 (reconstructed — see note below)

> **Note on dating:** this ADR documents decisions made incrementally across
> Fases 1-5 of the project (roughly 2026-07 through 2026-08-18). An earlier
> version of this file was believed to have been written and committed
> during Fase 3, but was never actually found in git history — it was
> either lost in a gitignored working-notes directory or never committed.
> This version was reconstructed from the decisions and trade-offs already
> recorded in `CLAUDE.md` as the project progressed, rather than written
> from a single point-in-time discussion.

## Context

Inntena is a free, open-source, multi-user tool for detecting design
trends in marketplaces like Etsy before they saturate. It needs to be
self-hostable by any seller with minimal friction — "clone the repo and run
it in 5 minutes, no mandatory external dependencies" — while still being a
credible, production-shaped portfolio piece: multi-user auth, a real
database, a deployed instance, and defensible technical trade-offs.

## Decisions

### Language and runtime: TypeScript + Node.js + Express

Strict TypeScript across the entire backend. Express was chosen over
heavier frameworks (NestJS, etc.) because the API surface is small
(auth, keywords, trends) and a minimal, explicit routing layer is easier
to reason about and explain in an interview than a framework's
conventions.

### Database: PostgreSQL over SQLite

PostgreSQL was chosen over SQLite despite the extra operational step
(a Docker Compose service locally, a managed instance in production)
because it is more representative of a real production environment, and
the author had prior experience with it. Runs via Docker Compose locally;
a managed Postgres instance in production (see Deployment below).

### ORM: Drizzle over Prisma

Drizzle was chosen over Prisma because it stays closer to SQL (queries
read like SQL with type safety layered on top, rather than an abstracted
query DSL), has no separate query-engine binary/process, and is
TypeScript-first. For a project this size, Prisma's extra tooling
(generated client, migration engine, schema DSL) was judged to add
overhead without proportional benefit.

### Auth: stateless JWT in an httpOnly cookie

Passwords are hashed with bcrypt; sessions are a JWT signed with a
server secret, stored in an httpOnly, secure, `sameSite=lax` cookie.

**Trade-off accepted consciously:** JWTs are stateless — there is no
server-side revocation list. Logout only clears the browser's cookie; a
token copied before logout stays valid until it expires (7 days by
default). This was accepted for simplicity given the project's scope. It
is a known limitation worth naming explicitly in an interview if asked
about the auth system's weaknesses.

### Trends data source: unofficial `google-trends-api`, collected sequentially

Google Trends has no official public API with an API key; the project
uses the unofficial `google-trends-api` npm package, which is free but
carries real risk of IP-based rate-limiting from Google.

Consequences of that constraint, all deliberate:

- Collection always runs **sequentially**, one region (`geo`) per
  invocation (`npm run collect -- --geo=US`) — never parallel requests
  or an automatic loop across multiple regions. This was decided after
  hitting real rate-limit blocks from Google during development.
- A base delay plus random jitter between requests, so request timing
  isn't trivially predictable.
- An automatic cooldown after 3 consecutive failures (treated as a
  probable rate-limit signal).
- Keywords already collected the same **local** calendar day are
  skipped (`getTodayLocal()`, not UTC), to avoid wasting requests.
- The rate limit is tied to the collecting IP, not to where the code
  runs — it is exactly as present in production as in local dev. Paid
  proxy rotation was explicitly considered and rejected: the project's
  answer to scale is the self-hosted model itself (each user runs their
  own instance, so each user has their own IP budget), not a shared paid
  proxy pool. That would only become worth reconsidering if a
  centrally-hosted, high-traffic version of the project existed, which
  is out of scope.

### Deployment: same-origin, single service (Render)

The production deployment serves both the API and the built React
frontend from a single Express process — `express.static` serves
`client/dist`, with a catch-all route falling back to `index.html` for
client-side routing, and everything under `/api/*` handled before that
catch-all so it's never shadowed.

This was chosen specifically to **eliminate CORS as a concern entirely**:
with a single origin, the browser's same-origin policy just works with no
`cors` package or configuration needed. The trade-off is that frontend
and backend cannot scale or deploy independently — accepted, since this
project has no traffic profile that would benefit from splitting them,
and revisiting this is explicitly flagged as a future consideration only
if that ever changes.

Render was chosen over alternatives (Railway was also evaluated) mainly
for its Blueprint (`render.yaml`) workflow, which keeps both the web
service and the managed Postgres instance defined in version control
rather than configured by hand.

One infra lesson from the real deploy: Render terminates TLS and proxies
requests, so without `app.set("trust proxy", 1)`, Express resolves every
request's `req.ip` to the same proxy address regardless of the real
client. Since `express-rate-limit` counts by `req.ip`, this silently
merged all traffic (real users, the GitHub Actions cron trigger, etc.)
into a single shared rate-limit bucket, causing real users to get
falsely blocked. This is a well-documented class of bug for Express
behind any PaaS (Render/Heroku/Railway) and worth mentioning in an
interview if asked about production debugging.

### Security middleware

- **Helmet**, mounted first in `createApp()`, with an explicit
  Content-Security-Policy (not the default) — `script-src 'self'`
  strict, Google Fonts allowed in `style-src`/`font-src`, with
  `'unsafe-inline'` in `style-src` only (required because
  React/Recharts set inline `style={{...}}` constantly). The one script
  that needed to run before React hydrates (the dark-mode flash
  prevention) was extracted to a real static file
  (`client/public/theme-init.js`) specifically so `script-src` needs no
  `unsafe-inline` exception at all.
- **`express-rate-limit`**, two limiters: a general `apiRateLimiter`
  (100 req/15min per IP, applied to all of `/api`) and a stricter
  `authRateLimiter` (10 req/15min per IP, applied only to
  register/login and other auth-sensitive endpoints) to slow down
  brute-force/credential-stuffing attempts.
- Centralized error handling only ever exposes `err.message` for
  operational (`AppError`) errors intended to be user-facing; everything
  else returns a generic message — no stack traces or raw database
  errors ever reach the client.

### Optional third-party integrations (Etsy, Fal.ai)

Any future integration with a paid or key-gated third-party API (Etsy
Open API v3, Fal.ai/Flux for image generation) must **always** be
optional and use the individual user's own API key — never a project-wide
key, and never a requirement for the core app to function. This protects
the core promise: the project must remain runnable with zero mandatory
external accounts.

## Alternatives considered and rejected

- **Prisma** instead of Drizzle — rejected for the reasons above (extra
  engine/tooling overhead relative to project size).
- **SQLite** instead of PostgreSQL — rejected in favor of production
  realism and prior author experience.
- **Session-based auth with server-side storage** (e.g. Redis-backed
  sessions) instead of stateless JWT — rejected for simplicity; the
  revocation trade-off was accepted instead.
- **Paid proxy rotation** for Google Trends collection — rejected; the
  self-hosted model (one IP per user) is the project's actual answer to
  the rate-limiting problem.
- **Separate frontend/backend deployments** with CORS configured between
  them — rejected in favor of same-origin deployment, which removes the
  problem instead of solving it.
- **Multi-platform support** (Amazon, TikTok Shop, MercadoLibre, Shopify)
  — evaluated and explicitly descoped; those platforms already have
  mature, well-funded trend-research tooling. The real gap Inntena
  targets is the AI-generated digital-product seller vertical, not any
  particular marketplace.

## Consequences

- The project can be cloned and run with just Docker (for Postgres) and
  `npm install` — no external API keys required for core functionality.
- Auth cannot revoke a session early; this is a known, documented
  limitation rather than an oversight.
- Trend collection throughput is deliberately conservative (sequential,
  jittered, cooldown-aware) — this trades collection speed for account
  longevity against Google's rate limiting.
- Frontend and backend are coupled to a single deployable unit; splitting
  them later would require introducing CORS configuration that was
  deliberately avoided so far.
