import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { healthRouter } from "./routes/health.route.js";
import { authRouter } from "./routes/auth.route.js";
import { publicConfigRouter } from "./routes/publicConfig.route.js";
import { keywordsRouter } from "./routes/keywords.route.js";
import { supplyRouter } from "./routes/supply.route.js";
import { regionsRouter } from "./routes/regions.route.js";
import { trendsRouter } from "./routes/trends.route.js";
import { internalRouter } from "./routes/internalCollect.route.js";
import { logger } from "./utils/logger.js";
import { apiRateLimiter } from "./middleware/rateLimit.middleware.js";

// dist/app.js -> ../client/dist: the built React app, produced by `npm run build`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, "../client/dist");

/** Builds and configures the Express application instance. */
export function createApp() {
  const app = express();

  // Render (and most PaaS hosts) puts the app behind a reverse proxy, so the real
  // client IP only arrives via X-Forwarded-For. Without this, Express falls back to
  // the proxy's own IP for every request, and express-rate-limit — which buckets by
  // req.ip — ends up sharing one limit across every client instead of one per client.
  // `1` trusts exactly the first hop (Render's edge), not an arbitrary chain.
  app.set("trust proxy", 1);

  // CSP allows Google Fonts (loaded by client/index.html) and inline style
  // attributes (React/Recharts set these constantly via style={{...}}); the
  // theme-flash-prevention script is an external file specifically so
  // script-src can stay at 'self' with no inline-script exception.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use(healthRouter);
  app.use("/api", apiRateLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/public-config", publicConfigRouter);
  app.use("/api/keywords", keywordsRouter);
  app.use("/api/supply", supplyRouter);
  app.use("/api/regions", regionsRouter);
  app.use("/api/internal", internalRouter);
  app.use("/api", trendsRouter);

  // Serves the built React app (client/dist). Static assets first, then a
  // catch-all for client-side routes (e.g. refreshing /dashboard directly);
  // unmatched /api/* requests fall through to the JSON 404 below instead.
  app.use(express.static(clientDistPath));
  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });

  // 404 handler, reached when no route above matched.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  // Centralized error handler; must be declared last, with 4 params,
  // for Express to recognize it as error-handling middleware.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error", { err });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}