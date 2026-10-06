import { AuthClaimsSchema, type AuthClaims } from "@pulse/shared";
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "pulse-api";
const AUDIENCE = "pulse-web";
const ALG = "HS256";

export interface VerifiedToken extends AuthClaims {
  /** Epoch ms. The WebSocket server uses it to close sockets when the token dies. */
  expiresAt: number;
}

export interface TokenService {
  sign(claims: AuthClaims): Promise<{ token: string; expiresAt: number }>;
  /** Throws if the token is invalid, expired, or its payload has the wrong shape. */
  verify(token: string): Promise<VerifiedToken>;
}

export function createTokenService(secret: string, expiresIn: string): TokenService {
  const key = new TextEncoder().encode(secret);

  return {
    async sign({ sub, tenantId, role }) {
      const token = await new SignJWT({ tenantId, role })
        .setProtectedHeader({ alg: ALG })
        .setSubject(sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key);

      // Read exp back from the token so the client gets the exact value.
      const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE });
      return { token, expiresAt: (payload.exp ?? 0) * 1000 };
    },

    async verify(token) {
      // jose checks signature, alg, exp, iss and aud. Pinning `algorithms`
      // blocks the classic "alg: none" / algorithm-confusion attacks.
      const { payload } = await jwtVerify(token, key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALG],
      });
      // A valid signature proves WHO issued it, not that the payload has the
      // shape we expect — so validate it with the shared Zod schema too.
      const claims = AuthClaimsSchema.parse(payload);
      return { ...claims, expiresAt: (payload.exp ?? 0) * 1000 };
    },
  };
}
