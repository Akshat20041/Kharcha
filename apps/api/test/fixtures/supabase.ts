import Fastify from "fastify";
import cors from "@fastify/cors";
import { createHmac, createHash, randomUUID } from "node:crypto";

// Test-only Auth server. Real SDK requests reach this fixture; no live accounts,
// email, production keys or application-level identity bypass are involved.
export async function startAuthFixture(port = 0) {
  const app = Fastify();
  await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PUT"] });
  const secret = randomUUID();
  type FixtureUser = { id: string; email: string; password: string; confirmed: boolean };
  const users = new Map<string, FixtureUser>();
  const refreshTokens = new Map<string, string>(); const revoked = new Set<string>();
  const recoveryCodes = new Map<string, { userId: string; challenge: string; redirect: string }>();
  app.post("/auth/v1/recover", async (request) => {
    const body = request.body as { email: string; code_challenge: string };
    const query = request.query as { redirect_to: string };
    const user = [...users.values()].find((item) => item.email === body.email);
    if (user) recoveryCodes.set(randomUUID(), { userId: user.id, challenge: body.code_challenge, redirect: query.redirect_to });
    return {};
  });
  // Test fixture only: stands in for opening the email, never in the real API.
  app.get("/__test/recovery-link", async (request, reply) => {
    const email = (request.query as { email: string }).email;
    const record = [...recoveryCodes].find(([, item]) => users.get(item.userId)?.email === email);
    if (!record) return reply.code(404).send({});
    return { url: `${record[1].redirect}?code=${record[0]}` };
  });
  let url = ""; const metrics = { verified: 0, refreshed: 0 };
  function addUser(email: string, confirmed = true) {
    const user: FixtureUser = { id: randomUUID(), email, password: "Test-only-pass-123!", confirmed };
    users.set(user.id, user); return user;
  }
  const a = addUser("a@example.test"), b = addUser("b@example.test");
  const publicUser = (user: typeof a) => ({ id: user.id, email: user.email, aud: "authenticated", role: "authenticated", is_anonymous: false,
    email_confirmed_at: user.confirmed ? "2026-01-01T00:00:00Z" : null, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
  function token(id: string, overrides: Record<string, unknown> = {}) {
    const data = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: id, iss: `${url}/auth/v1`, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), ...overrides })).toString("base64url")].join(".");
    return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
  }
  function verify(value: string) {
    try {
      if (revoked.has(value)) return null;
      const [header, payload, signature] = value.split(".");
      if (createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url") !== signature) return null;
      const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
      if (claims.iss !== `${url}/auth/v1` || claims.aud !== "authenticated" || claims.exp <= Date.now() / 1000) return null;
      const user = users.get(claims.sub); return user?.confirmed ? user : null;
    } catch { return null; }
  }
  function session(user: typeof a) {
    const refresh = randomUUID(); refreshTokens.set(refresh, user.id);
    return { access_token: token(user.id), refresh_token: refresh, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: publicUser(user) };
  }
  app.get("/auth/v1/user", async (request, reply) => {
    const user = verify((request.headers.authorization ?? "").replace(/^Bearer /i, ""));
    if (!user) return reply.code(401).send({ code: "bad_jwt", message: "Invalid JWT" });
    metrics.verified++; return publicUser(user);
  });
  app.post("/auth/v1/token", async (request, reply) => {
    const query = request.query as { grant_type: string };
    if (query.grant_type === "pkce") {
      const body = request.body as { auth_code: string; code_verifier: string };
      const recovery = recoveryCodes.get(body.auth_code);
      if (!recovery || createHash("sha256").update(body.code_verifier).digest("base64url") !== recovery.challenge) return reply.code(400).send({ error_code: "bad_code_verifier", msg: "Invalid recovery code" });
      recoveryCodes.delete(body.auth_code);
      return session(users.get(recovery.userId)!);
    }
    const body = request.body as { email?: string; password?: string; refresh_token?: string };
    const user = query.grant_type === "refresh_token" ? users.get(refreshTokens.get(body.refresh_token ?? "") ?? "")
      : [...users.values()].find((item) => item.email === body.email && item.password === body.password);
    if (!user) return reply.code(400).send({ error_code: "invalid_credentials", msg: "Invalid credentials" });
    if (!user.confirmed) return reply.code(400).send({ error_code: "email_not_confirmed", msg: "Email not confirmed" });
    if (query.grant_type === "refresh_token") metrics.refreshed++;
    return session(user);
  });
  app.post("/auth/v1/signup", async (request) => {
    const body = request.body as { email: string; password: string };
    const user = addUser(body.email, !body.email.startsWith("confirm")); user.password = body.password;
    return user.confirmed ? session(user) : publicUser(user);
  });
  app.put("/auth/v1/user", async (request, reply) => {
    const user = verify((request.headers.authorization ?? "").replace(/^Bearer /i, ""));
    if (!user) return reply.code(401).send({ code: "bad_jwt", message: "Invalid JWT" });
    const password = (request.body as { password: string }).password;
    if (typeof password !== "string" || password.length < 8) return reply.code(400).send({ code: "weak_password", message: "Weak password" });
    user.password = password;
    return publicUser(user);
  });
  app.post("/auth/v1/logout", async (request, reply) => {
    const token = (request.headers.authorization ?? "").replace(/^Bearer /i, "");
    const user = verify(token); revoked.add(token);
    if (user) for (const [key, id] of refreshTokens) { if (id === user.id) refreshTokens.delete(key); }
    return reply.code(204).send();
  });
  url = await app.listen({ host: "127.0.0.1", port });
  return { app, url, a, b, token, metrics, revoke: (value: string) => revoked.add(value) };
}
