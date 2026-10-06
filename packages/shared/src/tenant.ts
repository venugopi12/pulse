import { z } from "zod";
import { TenantIdSchema } from "./ids.js";

/** Hex colour like "#22d3ee". Each tenant owns an accent used for theming. */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected a 6-digit hex colour");

export const TenantSchema = z.object({
  id: TenantIdSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  accent: HexColorSchema,
});
export type Tenant = z.infer<typeof TenantSchema>;
