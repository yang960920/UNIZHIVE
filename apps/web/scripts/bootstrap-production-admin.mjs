import { createRequire } from "node:module";
import { lookup } from "node:dns/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decryptDiscordToken } from "../src/lib/server/discord-token-crypto.ts";
import {
  firstAdminBootstrapUninitialized,
  firstAdminTargetDecision,
  isExactBootstrapGuildMember,
  isPublicBootstrapAddress,
  parseProductionBootstrapArguments,
  productionBootstrapSettings,
} from "../src/lib/server/first-admin-bootstrap-policy.ts";

export async function confirmProductionDatabaseTarget(hostname) {
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => !isPublicBootstrapAddress(entry.address)))
    throw new Error("INVALID_PRODUCTION_TARGET");
}

export async function confirmBootstrapMembership(guildId, discordId, accessToken) {
  const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return false;
  return isExactBootstrapGuildMember(await response.json(), discordId);
}

/** The supplied SQL client is the operator connection, not the application's default database. */
export async function executeProductionFirstAdminBootstrap(
  database,
  args,
  settings,
  dependencies = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const decrypt = dependencies.decryptToken ?? decryptDiscordToken;
  const verifyMembership = dependencies.verifyMembership ?? confirmBootstrapMembership;
  return database.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(912743110)`;
    const [state] = await transaction`select
      (select count(*)::integer from users where role = 'ADMIN') as admin_count,
      (select count(*)::integer from audit_logs where action = 'admin.bootstrap') as bootstrap_count`;
    if (!state || !firstAdminBootstrapUninitialized(state.admin_count, state.bootstrap_count))
      return { status: "ALREADY_INITIALIZED" };
    const [row] = await transaction`select u.id, u.name, u.role,
      a.provider_account_id as discord_id, a.access_token, a.expires_at, a.scope,
      a.updated_at as account_updated_at,
      coalesce(length(trim(p.once_human_uid)) > 0 and length(trim(p.once_human_nickname)) >= 2
        and length(trim(p.display_name)) >= 2 and length(trim(p.handle)) >= 3, false) as profile_complete
      from users u inner join accounts a on a.user_id = u.id
      inner join member_profiles p on p.user_id = u.id
      where a.provider = 'discord' and a.provider_account_id = ${args.discordId}
      for update of u, a, p`;
    const target = row && {
      id: row.id,
      name: row.name,
      role: row.role,
      discordId: row.discord_id,
      profileComplete: row.profile_complete,
      encryptedAccessToken: row.access_token,
      expiresAt: row.expires_at,
      scope: row.scope,
      accountUpdatedAt: row.account_updated_at,
    };
    const decision = firstAdminTargetDecision(target, args.discordId, now());
    if (decision !== "READY") return { status: decision };
    let accessToken;
    try {
      accessToken = decrypt(
        target.encryptedAccessToken,
        `discord:${args.discordId}:access`,
        settings.authSecret,
      );
    } catch {
      return { status: "FRESH_DISCORD_LOGIN_REQUIRED" };
    }
    if (!(await verifyMembership(settings.guildId, args.discordId, accessToken)))
      return { status: "DISCORD_MEMBERSHIP_NOT_CONFIRMED" };
    if (!args.apply) return { status: "READY", userId: target.id, name: target.name };
    await transaction`update users set role = 'ADMIN', updated_at = now() where id = ${target.id}`;
    await transaction`insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
      values (${target.id}, 'admin.bootstrap', 'user', ${target.id},
        ${transaction.json({ previousRole: target.role, nextRole: "ADMIN", reasonCode: "EXPLICIT_PRODUCTION_SETUP" })})`;
    return { status: "APPLIED", userId: target.id, name: target.name };
  });
}

export async function runProductionAdminBootstrapCli({
  argv = process.argv.slice(2),
  env = process.env,
  connect,
  confirmTarget = confirmProductionDatabaseTarget,
  dependencies,
  log = console.log,
  error = console.error,
} = {}) {
  let args;
  let settings;
  try {
    args = parseProductionBootstrapArguments(argv);
    settings = productionBootstrapSettings(env);
  } catch {
    error(
      "Production setup requires --production, --discord-id, deployed authentication settings, and a public PostgreSQL URL with sslmode=verify-full. Local dotenv files are not loaded.",
    );
    return 1;
  }
  let database;
  try {
    await confirmTarget(settings.databaseHost);
    if (connect) database = connect(settings.databaseUrl, settings.databaseHost);
    else {
      const requireDatabase = createRequire(
        new URL("../../../packages/db/package.json", import.meta.url),
      );
      const postgres = requireDatabase("postgres");
      database = postgres(settings.databaseUrl, {
        max: 1,
        prepare: false,
        connect_timeout: 10,
        debug: false,
        ssl: { rejectUnauthorized: true, servername: settings.databaseHost },
        onnotice: () => {},
        connection: { application_name: "uniz-hive-production-admin-bootstrap" },
      });
    }
    const result = await executeProductionFirstAdminBootstrap(
      database,
      args,
      settings,
      dependencies,
    );
    log(JSON.stringify(result));
    return ["READY", "APPLIED"].includes(result.status) ? 0 : 2;
  } catch {
    error(
      "Production administrator setup could not complete. Check the target, deployed settings, and a fresh Discord login. No connection or credential details are printed.",
    );
    return 1;
  } finally {
    if (database) {
      try {
        await database.end({ timeout: 5 });
      } catch {
        error(
          "Production connection cleanup could not complete. Credential details are suppressed.",
        );
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runProductionAdminBootstrapCli();
