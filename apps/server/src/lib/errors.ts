import type { ApiError, ApiErrorCode } from "@pulse/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
};

/** Throw this from any route; the error handler turns it into JSON. */
export class HttpError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError("NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

/**
 * Single place that converts thrown errors into the shared ApiError shape.
 * Express 5 forwards rejected promises from async handlers here automatically
 * (Express 4 needed a wrapper for that).
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let body: ApiError;
  let status: number;

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: "BAD_REQUEST",
        message: "Validation failed",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    };
  } else if (isBodyParserError(err)) {
    status = 400;
    body = { error: { code: "BAD_REQUEST", message: "Malformed JSON body" } };
  } else {
    // Unknown error: log details server-side, return nothing sensitive.
    console.error(err);
    status = 500;
    body = { error: { code: "INTERNAL", message: "Something went wrong" } };
  }

  res.status(status).json(body);
};

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type: unknown }).type === "entity.parse.failed"
  );
}
