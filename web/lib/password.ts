import bcrypt from "bcryptjs";

const COST = 12;
export const MAX_PASSWORD_BYTES = 72;

export function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new RangeError(`Password must be at most ${MAX_PASSWORD_BYTES} UTF-8 bytes`);
  }
  return bcrypt.hash(password, COST);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
