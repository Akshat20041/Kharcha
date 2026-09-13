// Fixed windows with a bounded store. Saturation fails closed instead of evicting
// active counters. Each API process owns its own limits; no background timers.
export class RateLimit {
  private entries = new Map<string, { count: number; expires: number }>();
  constructor(private now = Date.now, private capacity = 10000) {}
  take(key: string, maximum: number): number {
    const now = this.now();
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= now) {
      if (!entry && this.entries.size >= this.capacity) {
        for (const [id, item] of this.entries) if (item.expires <= now) this.entries.delete(id);
        if (this.entries.size >= this.capacity) return 60;
      }
      entry = { count: 0, expires: now + 60000 };
      this.entries.set(key, entry);
    }
    if (entry.count >= maximum) return Math.max(1, Math.ceil((entry.expires - now) / 1000));
    entry.count++;
    return 0;
  }
}

export function routeBudget(route: string): [string, number] {
  if (route.startsWith("/expense-parser")) return ["ai", 10];
  if (route.startsWith("/exports")) return ["exports", 5];
  if (route.startsWith("/analytics") || route === "/dashboard") return ["analytics", 60];
  if (route === "/me") return ["profile", 30];
  if (route.includes("generate")) return ["generation", 20];
  return ["general", 240];
}
