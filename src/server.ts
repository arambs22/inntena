import dns from "node:dns";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

// Node 18+ prefers IPv6 results from DNS by default (Happy Eyeballs). Render's
// containers have no working outbound IPv6 route, which surfaced as
// ENETUNREACH connecting to smtp.gmail.com's IPv6 address — this makes
// dns.lookup() return IPv4 addresses first for every outbound connection in
// the process, matching what actually works in this hosting environment.
dns.setDefaultResultOrder("ipv4first");

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Inntena API listening on port ${env.PORT}`, {
    env: env.NODE_ENV,
  });
});
