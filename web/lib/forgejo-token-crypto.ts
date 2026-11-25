import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const configured = process.env.FORGEJO_TOKEN_ENCRYPTION_KEY;
  if (!configured || !/^[0-9a-f]{64}$/i.test(configured)) {
    throw new Error("FORGEJO_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key");
  }
  return Buffer.from(configured, "hex");
}

/** Bind encrypted values to the owning Gitka user and their intended use. */
export function encryptForgejoSecret(value: string, userId: string, purpose: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`gitka:forgejo:${userId}:${purpose}`, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptForgejoSecret(value: string, userId: string, purpose: string) {
  const [version, nonce, tag, ciphertext, ...extra] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !ciphertext || extra.length) throw new Error("Invalid encrypted Forgejo secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`gitka:forgejo:${userId}:${purpose}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
