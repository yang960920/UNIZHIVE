import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const webDirectory = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const nextRequire = createRequire(require.resolve("next/package.json"));
const { loadEnvConfig } = nextRequire("@next/env");
loadEnvConfig(webDirectory, true, { info() {}, error() {} });

const required = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_GUILD_ID",
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
];

async function verify() {
  for (const key of required) {
    if (!process.env[key]?.trim()) throw new Error(`Missing configuration: ${key}`);
  }
  if (!/^\d{17,20}$/.test(process.env.DISCORD_CLIENT_ID))
    throw new Error("Discord client ID format is invalid.");
  if (!/^\d{17,20}$/.test(process.env.DISCORD_GUILD_ID))
    throw new Error("Discord guild ID format is invalid.");
  console.log("PASS: required local configuration is present (values hidden).");

  // A short-lived application token verifies the client secret without signing in as a person.
  const credentials = {
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
  };
  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...credentials,
      grant_type: "client_credentials",
      scope: "identify",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Discord rejected the credential check (HTTP ${response.status}).`);
  const token = await response.json();
  if (typeof token.access_token !== "string" || token.token_type?.toLowerCase() !== "bearer")
    throw new Error("Discord returned an unexpected credential-check response.");
  console.log("PASS: Discord accepted the application client ID and secret.");

  const revoked = await fetch("https://discord.com/api/v10/oauth2/token/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...credentials,
      token: token.access_token,
      token_type_hint: "access_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!revoked.ok)
    throw new Error(`Temporary verification token cleanup failed (HTTP ${revoked.status}).`);
  console.log("PASS: temporary verification token revoked.");

  const base = new URL(process.env.NEXTAUTH_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
    throw new Error("This verifier checks a local web server only.");
  const providersResponse = await fetch(new URL("/api/auth/providers", base), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!providersResponse.ok)
    throw new Error(`Local login configuration failed (HTTP ${providersResponse.status}).`);
  const providers = await providersResponse.json();
  if (providers.discord?.id !== "discord") throw new Error("Discord login provider is not active.");
  console.log("PASS: local Discord login provider is active.");
  console.log(
    "Pending: a person must complete Discord login to verify guild membership and the OAuth callback.",
  );
}

try {
  await verify();
} catch (error) {
  // Never log response bodies, request bodies, environment values, or error causes.
  const message =
    error instanceof Error &&
    /^(Missing configuration:|Discord |Temporary verification|This verifier|Local login)/.test(
      error.message,
    )
      ? error.message
      : "Verification could not finish; check the local server and network connection.";
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}
