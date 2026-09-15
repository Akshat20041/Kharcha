import { z } from "zod";
import { timeZoneSchema } from "./time-zone.js";

const httpOrigin = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && url.origin === value;
}, "Must be an HTTP(S) origin without a path or trailing slash");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: httpOrigin.default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  GROQ_API_KEY: z.string().trim().optional(),
  GROQ_MODEL: z.string().trim().min(1).max(100).default("qwen/qwen3.8-27b"),
  AUTH_MODE: z.enum(["local", "supabase"]).default("local"),
  SUPABASE_URL: z.string().trim().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().optional(),
  APP_TIMEZONE: timeZoneSchema.default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  DATABASE_URL: z.url().refine((value) => {
    if (!URL.canParse(value)) return false;
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  }, "Must be a PostgreSQL connection URL"),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production") {
    if (value.AUTH_MODE !== "supabase") context.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "Production requires Supabase" });
    if (!value.WEB_ORIGIN.startsWith("https://")) context.addIssue({ code: "custom", path: ["WEB_ORIGIN"], message: "Production requires HTTPS" });
    if (!value.SUPABASE_URL?.startsWith("https://")) context.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "Production requires HTTPS" });
  }
  if (value.AUTH_MODE !== "supabase") return;
  try {
    const url = new URL(value.SUPABASE_URL ?? "");
    if (url.origin !== value.SUPABASE_URL || !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error();
  } catch { context.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "Valid Supabase origin required" }); }
  if (!value.SUPABASE_PUBLISHABLE_KEY || !/^[A-Za-z0-9._-]+$/.test(value.SUPABASE_PUBLISHABLE_KEY) || value.SUPABASE_PUBLISHABLE_KEY.includes("...") || value.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")) {
    context.addIssue({ code: "custom", path: ["SUPABASE_PUBLISHABLE_KEY"], message: "Public key required" });
  }
  if (value.SUPABASE_PUBLISHABLE_KEY?.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(value.SUPABASE_PUBLISHABLE_KEY.split(".")[1] ?? "", "base64url").toString()) as { role?: string };
      if (payload.role !== "anon") throw new Error();
    } catch { context.addIssue({ code: "custom", path: ["SUPABASE_PUBLISHABLE_KEY"], message: "Public anon key required" }); }
  }
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    // Report field names only; never include connection strings or credentials.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid environment configuration: ${fields.join(", ")}`);
  }
  return result.data;
}

export type Config = ReturnType<typeof readConfig>;
