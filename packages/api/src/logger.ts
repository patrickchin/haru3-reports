/**
 * Structured JSON logger via pino.
 *
 * One logger instance per process; child loggers attach request-id
 * and userId for correlation.
 */
import pino, { type Logger } from "pino";
import { getEnv } from "./env.js";

let cached: Logger | null = null;

export function getLogger(): Logger {
  if (cached) return cached;
  const env = getEnv();
  cached = pino({
    level: env.LOG_LEVEL,
    base: { service: "harpa-api", env: env.NODE_ENV },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-playground-key"]',
        'req.headers.cookie',
        '*.password',
        '*.apiKey',
      ],
      censor: "[redacted]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return cached;
}

/** Test-only: reset for unit tests with custom env. */
export function resetLoggerForTesting(): void {
  cached = null;
}
