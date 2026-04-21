import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(env.EIN_ENCRYPTION_KEY, "hex");

/** Encrypt a string. Returns iv:authTag:ciphertext in hex, colon-separated. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt a string encrypted with encrypt(). */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, authTagHex, dataHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Mask an EIN for display: XX-XXXXX42 */
export function maskEin(ein: string): string {
  const digits = ein.replace(/\D/g, "");
  if (digits.length < 2) return "**-*****";
  return `**-*****${digits.slice(-2)}`;
}
