import type { Category, ExpenseInput, Transaction, TransactionPage } from "./types";
import { authorizedFetch } from "./auth";

export class ApiError extends Error {
  constructor(message: string, public readonly issues: Record<string, string> = {}, public readonly status = 0) { super(message); }
}

export async function request<T>(path: string, method = "GET", body?: object, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new ApiError("The service connection is not configured. Please check the application setup.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let abortListener: () => void = () => {};
  try {
    signal.throwIfAborted();
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () => reject(new DOMException("Request cancelled", "AbortError"));
      signal.addEventListener("abort", abortListener, { once: true });
    });
    const response = await Promise.race([aborted, authorizedFetch(`${base.replace(/\/$/, "")}${path}`, {
      method, cache: "no-store", signal,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    })]);
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { error?: string; issues?: { field: string; message: string }[] } | null;
      const issues: Record<string, string> = {};
      if (Array.isArray(details?.issues)) for (const issue of details.issues) {
        if (typeof issue.field === "string" && typeof issue.message === "string") issues[issue.field] = issue.message;
      }
      throw new ApiError(path === "/expense-parser/parse" && details?.error ? details.error
        : response.status >= 500 ? "The service couldn't complete this request. Please try again."
        : response.status === 404 ? "This record is unavailable. Refresh the page and try again."
        : details?.error || "The request couldn't be completed.", issues, response.status);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (error instanceof ApiError) throw error;
    throw new ApiError(path === "/expense-parser/parse" ? "Couldn't read your expense. Your message is still here; retry or enter it manually."
      : method === "GET" ? "Can't connect to the service. Check that the backend is running, then retry."
      : "Couldn't confirm the change. Check your connection and refresh history before retrying, to avoid saving twice.");
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abortListener); }
}

export const api = {
  categories: () => request<{ data: Category[] }>("/categories"),
  transactions: (offset = 0, limit = 20) => request<TransactionPage>(`/transactions?limit=${limit}&offset=${offset}`),
  create: (data: ExpenseInput) => request<Transaction>("/transactions", "POST", data),
  update: (id: string, data: ExpenseInput) => request<Transaction>(`/transactions/${encodeURIComponent(id)}`, "PATCH", data),
  delete: (id: string) => request<void>(`/transactions/${encodeURIComponent(id)}?confirm=true`, "DELETE"),
};
