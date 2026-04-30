/**
 * Structured logger with PII scrubbing.
 *
 * SOC 2 CC6.1 / CC7.2: avoids leaking phone numbers, email addresses, JWTs,
 * IP addresses, UUIDs, and other identifiers into device logs / crash reports.
 *
 * Use `logger.error(...)` / `logger.warn(...)` / `logger.info(...)` instead
 * of `console.*` for any code path that may run in production.
 */

type LogLevel = "info" | "warn" | "error";

type Sink = {
  log: (level: LogLevel, message: string, context?: Record<string, unknown>) => void;
};

const DEFAULT_SINK: Sink = {
  log(level, message, context) {
    const fn =
      level === "error" ? console.error
      : level === "warn" ? console.warn
      : console.log;
    if (context && Object.keys(context).length > 0) {
      fn(`[${level}] ${message}`, context);
    } else {
      fn(`[${level}] ${message}`);
    }
  },
};

const SENSITIVE_KEY_PATTERN =
  /(token|jwt|secret|password|authorization|cookie|refresh|api[_-]?key|access[_-]?key|otp)/i;

const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const IP_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/g;

export function scrubString(input: string): string {
  // Order matters: scrub more-specific patterns (UUID, IP, email, bearer)
  // before the looser phone-number pattern, which would otherwise swallow
  // hyphenated UUIDs and dotted IPs.
  return input
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(UUID_PATTERN, "[uuid]")
    .replace(IP_PATTERN, "[ip]")
    .replace(PHONE_PATTERN, "[phone]");
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => scrubValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        result[k] = "[redacted]";
      } else {
        result[k] = scrubValue(v, depth + 1);
      }
    }
    return result;
  }
  return "[unsupported]";
}

export function scrubContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return scrubValue(context) as Record<string, unknown>;
}

export type Logger = {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => void;
};

export function createLogger(sink: Sink = DEFAULT_SINK): Logger {
  return {
    info(message, context) {
      sink.log("info", scrubString(message), scrubContext(context));
    },
    warn(message, context) {
      sink.log("warn", scrubString(message), scrubContext(context));
    },
    error(message, error, context) {
      const merged: Record<string, unknown> = { ...(context ?? {}) };
      if (error !== undefined) merged.error = error;
      sink.log("error", scrubString(message), scrubContext(merged));
    },
  };
}

export const logger = createLogger();
