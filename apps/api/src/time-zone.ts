import { z } from "zod";

export const timeZoneSchema = z.string().min(1).max(100).refine((value) => {
  if (/^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Use a valid IANA time zone, such as Asia/Kolkata");
