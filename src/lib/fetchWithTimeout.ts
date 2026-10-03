/**
 * `fetch` that gives up.
 *
 * React Native's `fetch` has no default timeout, and nothing in this app set
 * one: a request on a captive portal or a dead cell connection simply never
 * settled. For fire-and-forget calls that is a leak; for any caller that holds
 * a flag until the request ends (the analytics flush, the weather refresh) it
 * wedged that feature until the app restarted.
 *
 * Aborts after `ms`, rejecting like any network failure, so existing
 * `catch` blocks handle it with no new code path.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
