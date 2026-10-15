# Contributing to Inntena

Thanks for taking the time! Bug reports, ideas, translations, docs and code are all welcome.

## Ways to help

- **Found a bug?** [Open an issue](https://github.com/arambs22/inntena/issues) with:
  - what you did;
  - what you expected;
  - what happened instead (screenshots and console errors help a lot).
- **Have an idea?** Open an issue first, so we can agree on the approach before you spend time on it.
- **Sell on Etsy?** Feedback on which signals actually help you pick a niche is gold.

## Getting set up

Follow [Run it locally](./README.md#-run-it-locally) in the README. In short:

```bash
npm install && npm install --prefix client
cp .env.example .env              # fill JWT_SECRET and CRON_SECRET (≥ 32 chars)
docker compose up -d && npm run db:migrate
npm run dev                       # API on :3000
npm run dev --prefix client       # app on :5173
```

## Before you open a pull request

Run the same checks as CI:

```bash
npm run typecheck && npm run typecheck:test && npm run lint
cp .env.test.example .env.test && npm test       # backend, real Postgres test DB
npm run typecheck --prefix client && npm run lint --prefix client && npm test --prefix client
```

## Guidelines

- **Keep PRs small and focused.** One change per PR is the easiest to review.
- **Add a test** for new behavior or a bug fix.
  - Backend tests run against a real Postgres database (`tests/`).
  - Frontend tests cover pure logic in `client/src/lib/`.
- **Code comments** are in English and in JSDoc style, explaining *why* rather than *what*.
- **User-facing text** never goes hard-coded in a component:
  - interface text goes in `client/src/lib/i18n.ts`, in both English and neutral Spanish;
  - legal pages go in `client/src/lib/legalContent.ts`.
- **Colors** use the design tokens (`bg-surface`, `text-primary`, …) from `client/src/index.css`, never raw hex values in components.
- **External APIs:**
  - Keep Google Trends requests sequential and polite.
  - Respect Etsy's API terms: listing data stays out of the database beyond the documented cache windows, and no analysis of Etsy content.
- **Commits:** short, descriptive messages in English.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
