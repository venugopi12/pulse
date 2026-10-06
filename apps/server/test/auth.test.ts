import { decodeJwt } from "jose";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  LoginResponseSchema,
  MeResponseSchema,
  TenantIdSchema,
  UserIdSchema,
} from "@pulse/shared";
import { DEMO_PASSWORD } from "../src/seed-data.js";
import { createTokenService } from "../src/auth/jwt.js";
import { buildTestServer, type TestServer } from "./helpers.js";

let ctx: TestServer;
beforeAll(async () => {
  ctx = await buildTestServer();
});

const login = (email: string, password = DEMO_PASSWORD) =>
  request(ctx.app).post("/api/auth/login").send({ email, password });

/** Log in and return a parsed (typed) LoginResponse. */
const loginOk = async (email: string) => LoginResponseSchema.parse((await login(email)).body);

describe("POST /api/auth/login", () => {
  it("returns a token whose claims carry the user's tenant and role", async () => {
    const res = await login("admin@nova.test");
    expect(res.status).toBe(200);

    const body = LoginResponseSchema.parse(res.body); // response matches the shared contract
    expect(body.user).toMatchObject({ email: "admin@nova.test", role: "admin", tenantId: "tnt_nova" });
    expect(body.tenant.name).toBe("Nova Retail");
    // Check the RAW body: Zod .parse() strips unknown keys, which would hide a leak.
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const claims = decodeJwt(body.token);
    expect(claims).toMatchObject({ sub: body.user.id, tenantId: "tnt_nova", role: "admin" });
  });

  it("accepts mixed-case email with whitespace", async () => {
    const res = await login("  Viewer@Orbit.TEST ");
    expect(res.status).toBe(200);
    expect(LoginResponseSchema.parse(res.body).user.role).toBe("viewer");
  });

  it("gives the same 401 for wrong password and unknown email", async () => {
    const wrongPw = await login("admin@acme.test", "not-the-password");
    const noUser = await login("nobody@acme.test");
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body); // no user enumeration
    expect(ApiErrorSchema.parse(wrongPw.body).error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 with field issues for an invalid body", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ email: "nope", password: "x" });
    expect(res.status).toBe(400);
    const { error } = ApiErrorSchema.parse(res.body);
    expect(error.issues?.map((i) => i.path).sort()).toEqual(["email", "password"]);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user and tenant for a valid token", async () => {
    const { token } = await loginOk("viewer@acme.test");
    const res = await request(ctx.app).get("/api/auth/me").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const me = MeResponseSchema.parse(res.body);
    expect(me.tenant.id).toBe("tnt_acme");
    expect(me.user.role).toBe("viewer");
  });

  it("rejects a missing token", async () => {
    const res = await request(ctx.app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with a different secret", async () => {
    const forger = createTokenService("attacker-secret-that-is-also-32-chars-long!!", "1h");
    const { token } = await forger.sign({
      sub: UserIdSchema.parse("usr_nova-retail_admin"),
      tenantId: TenantIdSchema.parse("tnt_nova"),
      role: "admin",
    });
    const res = await request(ctx.app).get("/api/auth/me").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects a token whose payload was tampered with", async () => {
    const { token } = await loginOk("viewer@acme.test");
    const [h, p, s] = token.split(".");
    const payload = JSON.parse(Buffer.from(p ?? "", "base64url").toString()) as Record<string, unknown>;
    payload.role = "admin"; // privilege escalation attempt
    const forged = [h, Buffer.from(JSON.stringify(payload)).toString("base64url"), s].join(".");
    const res = await request(ctx.app).get("/api/auth/me").set("authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});

describe("login rate limiting", () => {
  it("returns 429 after too many attempts from one IP", async () => {
    const limited = await buildTestServer({ loginRateLimit: { windowMs: 60_000, limit: 3 } });
    const attempt = () =>
      request(limited.app).post("/api/auth/login").send({ email: "admin@acme.test", password: "wrong-password" });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe("TOO_MANY_REQUESTS");
  });
});

describe("misc", () => {
  it("health check is public", async () => {
    expect((await request(ctx.app).get("/api/health")).status).toBe(200);
  });

  it("unknown /api routes are 401 when anonymous (no route discovery), 404 when signed in", async () => {
    expect((await request(ctx.app).get("/api/nope")).status).toBe(401);
    const { token } = await loginOk("viewer@acme.test");
    const res = await request(ctx.app).get("/api/nope").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe("NOT_FOUND");
  });
});
