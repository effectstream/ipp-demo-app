// Minimal in-memory rate limiter for the unauthenticated /lookup endpoint.
// A 6-digit passcode is only ~1M values, so without throttling it is
// brute-forceable. Keyed by rut+IP; failures accumulate, success clears.
//
// In-memory is fine for the single-instance dev backend. A multi-instance
// deployment would move this to Redis/Postgres.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Entry {
  count: number;
  first: number; // epoch ms of the first failure in the current window
}

const failures = new Map<string, Entry>();

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRate(key: string, now: number): RateDecision {
  const e = failures.get(key);
  if (!e) return { allowed: true };
  // Window expired → forget and allow.
  if (now - e.first > WINDOW_MS) {
    failures.delete(key);
    return { allowed: true };
  }
  if (e.count >= MAX_FAILURES) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((WINDOW_MS - (now - e.first)) / 1000),
    };
  }
  return { allowed: true };
}

export function recordFailure(key: string, now: number): void {
  const e = failures.get(key);
  if (!e || now - e.first > WINDOW_MS) {
    failures.set(key, { count: 1, first: now });
  } else {
    e.count += 1;
  }
}

export function clearRate(key: string): void {
  failures.delete(key);
}
