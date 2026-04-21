import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;

export interface GeneratedApiKey {
  /** Full plaintext key — shown to user ONCE, then discarded. */
  plaintext: string;
  /** First 16 chars after the env prefix — stored and used for fast DB lookup. */
  prefix: string;
  /** Bcrypt hash of the full key — stored in DB. */
  hash: string;
  /** Last 4 chars — shown in dashboard for identification. */
  hint: string;
  environment: "live" | "test";
}

/** Generate a new API key. Format: spk_{env}_{random32hex} */
export async function generateApiKey(
  environment: "live" | "test" = "live",
): Promise<GeneratedApiKey> {
  const random = randomBytes(32).toString("hex");
  const plaintext = `spk_${environment}_${random}`;
  const prefix = plaintext.slice(0, 24); // "spk_live_" + first 15 chars
  const hint = plaintext.slice(-4);
  const hash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
  return { plaintext, prefix, hash, hint, environment };
}

/** Verify a raw key against its stored hash. */
export async function verifyApiKey(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/** Extract the prefix from a raw key for fast DB lookup. */
export function extractPrefix(rawKey: string): string {
  return rawKey.slice(0, 24);
}
