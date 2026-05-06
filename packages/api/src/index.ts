/**
 * Server entrypoint. Starts a Node HTTP server bound to PORT.
 * Handles SIGTERM for graceful shutdown (drain connections, exit).
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getEnv } from "./env.js";
import { getLogger } from "./logger.js";

async function main() {
  const env = getEnv();
  const logger = getLogger();
  const app = createApp();

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      hostname: "0.0.0.0",
    },
    (info) => {
      logger.info(
        { port: info.port, env: env.NODE_ENV },
        "harpa-api listening",
      );
    },
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutdown signal received, draining…");
    server.close((err) => {
      if (err) {
        logger.error({ err }, "error during shutdown");
        process.exit(1);
      }
      logger.info("shutdown complete");
      process.exit(0);
    });

    // Hard kill if drain takes longer than 30s.
    setTimeout(() => {
      logger.warn("forcing exit after 30s drain timeout");
      process.exit(1);
    }, 30_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
