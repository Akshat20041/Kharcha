import { ApiError, request } from "./api";
import type { Profile } from "./preferences";

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

// Only this read is retried. Four 20-second attempts plus 1/2/4-second delays
// cover a typical sleeping API without an endless loop or duplicate writes.
export async function loadProfile(signal: AbortSignal, onRetry: () => void) {
  for (let attempt = 0; attempt < 4; attempt++) {
    signal.throwIfAborted();
    try { return await request<Profile>("/me", "GET", undefined, { signal, timeoutMs: 20000 }); }
    catch (error) {
      if (signal.aborted) throw error;
      if (!(error instanceof ApiError) || !(error.status === 0 || error.status === 408 || error.status >= 500) || attempt === 3) throw error;
      onRetry();
      await pause(1000 * 2 ** attempt, signal);
    }
  }
  throw new Error("Account unavailable");
}
