import { isIP } from "node:net";

export const FIRST_ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface ProductionBootstrapArguments {
  discordId: string;
  apply: boolean;
}

/** This parser is used only by the operator CLI, never by an HTTP signup route. */
export function parseProductionBootstrapArguments(
  args: readonly string[],
): ProductionBootstrapArguments {
  let production = false;
  let apply = false;
  let discordId: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--production" && !production) production = true;
    else if (argument === "--apply" && !apply) apply = true;
    else if (argument === "--discord-id" && discordId === undefined) {
      discordId = args[++index];
      if (!discordId || !/^\d{17,20}$/.test(discordId)) throw new Error("INVALID_ARGUMENTS");
    } else throw new Error("INVALID_ARGUMENTS");
  }
  if (!production || !discordId) throw new Error("INVALID_ARGUMENTS");
  return { discordId, apply };
}

export function isPublicBootstrapHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return Boolean(
    host.length <= 253 &&
    host.includes(".") &&
    !/^\d+(?:\.\d+){3}$/.test(host) &&
    !host.includes(":") &&
    !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) &&
    host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
  );
}

/** DNS is checked by the CLI too, so a public-looking hostname cannot resolve to a local target. */
export function isPublicBootstrapAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first, second, third] = address.split(".").map(Number);
    if (address.split(".").some((part) => Number(part) > 255)) return false;
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 192 && second === 0) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113)
    );
  }
  if (isIP(address) !== 6) return false;
  const ip = new URL(`http://[${address}]`).hostname.slice(1, -1).toLowerCase();
  return Boolean(
    /^[23][0-9a-f]{3}:/.test(ip) &&
    ip !== "::" &&
    ip !== "::1" &&
    !ip.startsWith("::ffff:") &&
    !/^(?:fc|fd|fe[89ab]|ff)/.test(ip) &&
    !ip.startsWith("2001:db8:"),
  );
}

/** Only the caller's provided environment is read. Local dotenv files are never loaded here. */
export function productionBootstrapSettings(env: Readonly<Record<string, string | undefined>>): {
  databaseUrl: string;
  databaseHost: string;
  guildId: string;
  authSecret: string;
} {
  let database: URL;
  let origin: URL;
  try {
    database = new URL(env.DATABASE_URL ?? "");
    origin = new URL(env.NEXTAUTH_URL ?? "");
  } catch {
    throw new Error("INVALID_PRODUCTION_SETTINGS");
  }
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !isPublicBootstrapHostname(database.hostname) ||
    !database.username ||
    !database.password ||
    !database.pathname.slice(1) ||
    database.searchParams.getAll("sslmode").length !== 1 ||
    database.searchParams.get("sslmode") !== "verify-full" ||
    [...database.searchParams.keys()].some((key) => key !== "sslmode") ||
    database.hash ||
    origin.protocol !== "https:" ||
    !isPublicBootstrapHostname(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.hash ||
    !/^\d{17,20}$/.test(env.DISCORD_GUILD_ID ?? "") ||
    (env.NEXTAUTH_SECRET?.trim().length ?? 0) < 32 ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    throw new Error("INVALID_PRODUCTION_SETTINGS");
  return {
    databaseUrl: database.toString(),
    databaseHost: database.hostname,
    guildId: env.DISCORD_GUILD_ID!,
    authSecret: env.NEXTAUTH_SECRET!,
  };
}

export interface FirstAdminTarget {
  id: string;
  name: string;
  role: string;
  discordId: string;
  profileComplete: boolean;
  encryptedAccessToken: string | null;
  expiresAt: number | null;
  scope: string | null;
  accountUpdatedAt: Date;
}

export function firstAdminBootstrapUninitialized(
  adminCount: number,
  bootstrapCount: number,
): boolean {
  return adminCount === 0 && bootstrapCount === 0;
}

export function firstAdminTargetDecision(
  target: FirstAdminTarget | undefined,
  discordId: string,
  now: Date,
):
  | "READY"
  | "LOGIN_AND_PROFILE_REQUIRED"
  | "COMPLETE_PROFILE_AND_LOGIN_REQUIRED"
  | "FRESH_DISCORD_LOGIN_REQUIRED" {
  if (!target || target.discordId !== discordId) return "LOGIN_AND_PROFILE_REQUIRED";
  if (!target.profileComplete || !["APPLICANT", "MEMBER", "OFFICER"].includes(target.role))
    return "COMPLETE_PROFILE_AND_LOGIN_REQUIRED";
  const age = now.getTime() - target.accountUpdatedAt.getTime();
  const scopes = new Set((target.scope ?? "").split(/\s+/));
  if (
    !target.encryptedAccessToken?.startsWith("oauth:v1:") ||
    !Number.isSafeInteger(target.expiresAt) ||
    target.expiresAt! <= Math.floor(now.getTime() / 1000) + 30 ||
    !scopes.has("identify") ||
    !scopes.has("guilds.members.read") ||
    !Number.isFinite(age) ||
    age < -60_000 ||
    age > FIRST_ADMIN_LOGIN_WINDOW_MS
  )
    return "FRESH_DISCORD_LOGIN_REQUIRED";
  return "READY";
}

export function isExactBootstrapGuildMember(member: unknown, discordId: string): boolean {
  if (!member || typeof member !== "object" || !("user" in member)) return false;
  const user = member.user;
  return Boolean(
    user &&
    typeof user === "object" &&
    "id" in user &&
    user.id === discordId &&
    !("bot" in user && user.bot === true) &&
    !("pending" in member && member.pending === true),
  );
}
