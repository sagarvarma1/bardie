import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config.js";

// AES-256-GCM for secrets at rest (Google refresh tokens). Stored as
// base64(iv | authTag | ciphertext).

function key(): Buffer {
  const k = Buffer.from(config.encryptionKey, "base64");
  if (k.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 random bytes, base64-encoded (openssl rand -base64 32)");
  }
  return k;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
