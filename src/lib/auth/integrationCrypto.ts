import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEV_FALLBACK_SECRET = "coffeetide-integration-dev-only-secret";

function getKey(): Buffer {
  const secret =
    process.env.INTEGRATION_ENCRYPTION_SECRET || process.env.SESSION_ENCRYPTION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "INTEGRATION_ENCRYPTION_SECRET or SESSION_ENCRYPTION_SECRET is required in production."
    );
  }
  return createHash("sha256")
    .update(`coffeetide:integration:v1:${secret || DEV_FALLBACK_SECRET}`)
    .digest();
}

export function encryptIntegrationCredentials(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptIntegrationCredentials<T>(ciphertext: string): T | null {
  try {
    const value = Buffer.from(ciphertext, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", getKey(), value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    const plaintext = Buffer.concat([
      decipher.update(value.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as T;
  } catch {
    return null;
  }
}
