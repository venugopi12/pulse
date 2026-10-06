import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can } from "../src/index.js";

describe("role permission matrix", () => {
  it("admins can do everything", () => {
    for (const p of PERMISSIONS) expect(can("admin", p)).toBe(true);
  });

  it("viewers are read-only", () => {
    expect(ROLE_PERMISSIONS.viewer.every((p) => p.endsWith(":read"))).toBe(true);
    expect(can("viewer", "dashboard:write")).toBe(false);
    expect(can("viewer", "users:invite")).toBe(false);
  });
});
