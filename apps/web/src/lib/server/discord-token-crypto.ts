import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function deriveTokenKey(secret: string): Buffer {
  if (secret.trim().length < 32)
    throw new Error("A strong auth secret is required for OAuth storage.");
  return Buffer.from(
    hkdfSync("sha256", secret.trim(), "uniz-hive-oauth:v1", "discord-token:aes-256-gcm", 32),
  );
}

/** AAD binds ciphertext to the Discord identity and token field; ciphertext is not portable. */
export function encryptDiscordToken(token: string, context: string, secret: string): string {
  if (!token || token.length > 16_384) throw new Error("Invalid OAuth token.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveTokenKey(secret), nonce);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "oauth",
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptDiscordToken(envelope: string, context: string, secret: string): string {
  try {
    const [prefix, version, nonceEncoded, tagEncoded, ciphertextEncoded, extra] =
      envelope.split(":");
    if (
      prefix !== "oauth" ||
      version !== "v1" ||
      extra !== undefined ||
      !nonceEncoded ||
      !tagEncoded ||
      !ciphertextEncoded ||
      envelope.length > 24_000
    )
      throw new Error("Invalid envelope.");
    if (
      ![nonceEncoded, tagEncoded, ciphertextEncoded].every((part) => /^[A-Za-z0-9_-]+$/.test(part))
    )
      throw new Error("Invalid encoding.");
    const nonce = Buffer.from(nonceEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    if (nonce.length !== 12 || tag.length !== 16) throw new Error("Invalid envelope.");
    const decipher = createDecipheriv("aes-256-gcm", deriveTokenKey(secret), nonce);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Avoid leaking either a token, secret, or ciphertext in a lower-level crypto error.
    throw new Error("OAuth token could not be decrypted.");
  }
}
