import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { decryptDiscordToken } from "../src/lib/server/discord-token-crypto.ts";

// Invoke with Node --conditions=react-server so the server-only crypto module stays protected.
const args = process.argv.slice(2);
const idIndex = args.indexOf("--discord-id");
const discordId = idIndex >= 0 ? args[idIndex + 1] : undefined;
const apply = args.includes("--apply");
const allowedArgs = new Set(["--discord-id", "--apply", discordId]);
if (!discordId || !/^\d{17,20}$/.test(discordId) || args.some((arg) => !allowedArgs.has(arg))) {
  console.error(
    "Usage: node --conditions=react-server apps/web/scripts/bootstrap-admin.mjs --discord-id <Discord User ID> [--apply]",
  );
  process.exit(1);
}
const env = { ...process.env };
for (const relative of ["../../../.env", "../.env.local"]) {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  if (existsSync(path)) Object.assign(env, parseEnv(readFileSync(path, "utf8")));
}
if (process.env.NODE_ENV === "production" || env.NODE_ENV === "production") {
  console.error("First-admin bootstrap is restricted to local development.");
  process.exit(1);
}
let databaseUrl;
try {
  databaseUrl = new URL(env.DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)
  )
    throw new Error();
} catch {
  console.error("A local PostgreSQL connection is required.");
  process.exit(1);
}
if (
  !/^\d{17,20}$/.test(env.DISCORD_GUILD_ID ?? "") ||
  (env.NEXTAUTH_SECRET?.trim().length ?? 0) < 32
) {
  console.error("Discord guild and authentication settings are incomplete.");
  process.exit(1);
}
const requireDatabase = createRequire(
  new URL("../../../packages/db/package.json", import.meta.url),
);
const postgres = requireDatabase("postgres");
const database = postgres(databaseUrl.toString(), { max: 1, prepare: false });
try {
  const result = await database.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(912743110)`;
    const [state] = await transaction`select
      (select count(*)::integer from users where role = 'ADMIN') as admin_count,
      (select count(*)::integer from audit_logs where action = 'admin.bootstrap') as bootstrap_count`;
    if (state.admin_count !== 0 || state.bootstrap_count !== 0)
      return { status: "ALREADY_INITIALIZED" };
    const [target] =
      await transaction`select u.id, u.name, u.role, a.access_token, a.expires_at, a.scope,
      coalesce(length(trim(p.once_human_uid)) > 0 and length(trim(p.once_human_nickname)) >= 2 and length(trim(p.handle)) >= 3, false) as profile_complete
      from users u inner join accounts a on a.user_id = u.id
      inner join member_profiles p on p.user_id = u.id
      where a.provider = 'discord' and a.provider_account_id = ${discordId}
      for update of u, a, p`;
    if (!target) return { status: "LOGIN_AND_PROFILE_REQUIRED" };
    if (!target.profile_complete || target.role === "GUEST")
      return { status: "COMPLETE_PROFILE_AND_LOGIN_REQUIRED" };
    const scopes = new Set((target.scope ?? "").split(/\s+/));
    if (
      !target.access_token ||
      target.expires_at <= Math.floor(Date.now() / 1000) + 30 ||
      !scopes.has("identify") ||
      !scopes.has("guilds.members.read")
    )
      return { status: "FRESH_DISCORD_LOGIN_REQUIRED" };
    let token;
    try {
      token = decryptDiscordToken(
        target.access_token,
        `discord:${discordId}:access`,
        env.NEXTAUTH_SECRET,
      );
    } catch {
      return { status: "FRESH_DISCORD_LOGIN_REQUIRED" };
    }
    const membership = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) },
    );
    if (!membership.ok) return { status: "DISCORD_MEMBERSHIP_NOT_CONFIRMED" };
    const member = await membership.json();
    if (member?.user?.id !== discordId) return { status: "DISCORD_MEMBERSHIP_NOT_CONFIRMED" };
    if (!apply) return { status: "READY", userId: target.id, name: target.name };
    await transaction`update users set role = 'ADMIN', updated_at = now() where id = ${target.id}`;
    await transaction`insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
      values (${target.id}, 'admin.bootstrap', 'user', ${target.id}, ${transaction.json({ previousRole: target.role, nextRole: "ADMIN", reasonCode: "EXPLICIT_LOCAL_SETUP" })})`;
    return { status: "APPLIED", userId: target.id, name: target.name };
  });
  // Only an intentionally small result is printed. No UID, tokens, secrets or ciphertext.
  console.log(JSON.stringify(result, null, 2));
  if (!["READY", "APPLIED"].includes(result.status)) process.exitCode = 2;
} catch {
  console.error(
    "Bootstrap could not complete. Check the local database and Discord login, then retry.",
  );
  process.exitCode = 1;
} finally {
  await database.end();
}
