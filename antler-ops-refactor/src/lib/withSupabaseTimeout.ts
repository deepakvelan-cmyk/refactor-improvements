/**
 * Wrap a Supabase promise with a timeout.  If the promise does not settle
 * within the specified period, the returned promise rejects with an error.
 *
 * @param promise The promise to race against a timeout
 * @param ms Timeout in milliseconds (default 12 seconds)
 */
export function withSupabaseTimeout<T = any>(promise: Promise<T>, ms = 12_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms)),
  ]);
}

/** Sleep for the given duration. */
export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a promise once after a short delay.  Useful for transient network
 * errors.  In a production application you might implement exponential
 * back‑off and inspect error codes to decide whether to retry.
 */
export async function withRetry<T>(fn: () => Promise<T>, delayMs = 400): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await delay(delayMs);
    return fn();
  }
}