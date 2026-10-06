import bcrypt from "bcryptjs";

/** bcryptjs is pure JS — no native build step, works on every OS/CI. */
const COST = 10;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/**
 * A real hash of a random string. When a login email doesn't exist we still
 * run bcrypt against this, so "unknown email" and "wrong password" take the
 * same time — attackers can't use response timing to discover valid emails.
 */
export const DUMMY_HASH = await hashPassword("timing-safe-dummy-password");
