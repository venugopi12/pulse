import { describe, expect, it } from "vitest";
import { LoginRequestSchema, TenantSchema } from "../src/index.js";

describe("LoginRequestSchema", () => {
  it("normalises email to trimmed lowercase", () => {
    const parsed = LoginRequestSchema.parse({
      email: "  Admin@Acme.Test ",
      password: "pulse-demo-123",
    });
    expect(parsed.email).toBe("admin@acme.test");
  });

  it("rejects short passwords", () => {
    const result = LoginRequestSchema.safeParse({
      email: "a@b.co",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("TenantSchema", () => {
  it("rejects a non-hex accent", () => {
    const result = TenantSchema.safeParse({
      id: "t1",
      slug: "acme",
      name: "Acme",
      accent: "teal",
    });
    expect(result.success).toBe(false);
  });
});
