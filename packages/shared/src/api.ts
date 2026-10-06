import { z } from "zod";

/** Every non-2xx JSON response from the API has this shape. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "TOO_MANY_REQUESTS",
      "INTERNAL",
    ]),
    message: z.string(),
    /** Field-level validation issues, when code === "BAD_REQUEST". */
    issues: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiErrorCode = ApiError["error"]["code"];
