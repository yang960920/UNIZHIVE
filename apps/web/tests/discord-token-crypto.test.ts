import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptDiscordToken, encryptDiscordToken } from "../src/lib/server/discord-token-crypto";

const secret = "a-test-only-auth-secret-with-at-least-thirty-two-characters";
const context = "discord:123456789012345678:access";

describe("server-side OAuth authenticated encryption", () => {
  it("roundtrips a token while storing unpredictable ciphertext rather than plaintext", () => {
    const token = "an-example-oauth-access-token";
    const first = encryptDiscordToken(token, context, secret);
    const second = encryptDiscordToken(token, context, secret);
    expect(first).not.toContain(token);
    expect(first).not.toBe(second);
    expect(decryptDiscordToken(first, context, secret)).toBe(token);
  });

  it("rejects ciphertext or authentication tag tampering", () => {
    const envelope = encryptDiscordToken("private-token", context, secret).split(":");
    const ciphertext = Buffer.from(envelope[4], "base64url");
    ciphertext[0] ^= 1;
    envelope[4] = ciphertext.toString("base64url");
    expect(() => decryptDiscordToken(envelope.join(":"), context, secret)).toThrow(
      "could not be decrypted",
    );
    const tagged = encryptDiscordToken("private-token", context, secret).split(":");
    const tag = Buffer.from(tagged[3], "base64url");
    tag[0] ^= 1;
    tagged[3] = tag.toString("base64url");
    expect(() => decryptDiscordToken(tagged.join(":"), context, secret)).toThrow(
      "could not be decrypted",
    );
  });

  it("rejects a different identity, token column, encryption key, and legacy plaintext", () => {
    const envelope = encryptDiscordToken("private-token", context, secret);
    for (const alternateContext of [
      "discord:987654321098765432:access",
      "discord:123456789012345678:refresh",
    ]) {
      expect(() => decryptDiscordToken(envelope, alternateContext, secret)).toThrow();
    }
    expect(() => decryptDiscordToken(envelope, context, `${secret}-rotated`)).toThrow();
    expect(() => decryptDiscordToken("legacy-plaintext-token", context, secret)).toThrow();
    expect(() => encryptDiscordToken("token", context, "short-key")).toThrow("strong auth secret");
  });
});
