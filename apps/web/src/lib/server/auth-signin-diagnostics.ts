import "server-only";

export type SignInFailureStage = "DISCORD_GUILD_CHECK" | "ACCOUNT_PERSISTENCE";

const postgresCodes = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "23502",
  "23503",
  "23505",
  "23514",
  "28000",
  "28P01",
  "3D000",
  "3F000",
  "40001",
  "40P01",
  "42501",
  "42703",
  "42704",
  "42883",
  "42P01",
  "53300",
  "53400",
  "55P03",
  "57014",
  "57P01",
  "57P02",
  "57P03",
  "57P05",
]);
const transportCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "EPIPE",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const validationReasons = new Map([
  ["A strong auth secret is required for OAuth storage.", "AUTH_SECRET_TOO_SHORT"],
  ["Invalid OAuth token.", "OAUTH_TOKEN_INVALID"],
  ["Discord OAuth consent is incomplete.", "OAUTH_GRANT_INCOMPLETE"],
  ["Invalid Discord ID.", "DISCORD_ID_INVALID"],
  ["Linked Discord identity has no user.", "LINKED_USER_MISSING"],
  ["Failed to create Discord user.", "USER_CREATION_FAILED"],
]);

type SafeFailure =
  | { category: "POSTGRES" | "TRANSPORT"; code: string }
  | { category: "DISCORD_API"; kind: "UNAUTHORIZED" | "UNAVAILABLE"; status: number | null }
  | { category: "VALIDATION"; reason: string }
  | { category: "UNKNOWN" };

export type SignInFailureDiagnostics = SafeFailure & {
  stage: SignInFailureStage | "UNKNOWN";
};

type DiagnosticProperty = "code" | "name" | "kind" | "status" | "message" | "cause";

/** Read data properties only: hostile accessors must not execute during error reporting. */
function ownValue(error: object, key: DiagnosticProperty): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function classify(error: object): SafeFailure | undefined {
  const code = ownValue(error, "code");
  if (typeof code === "string" && postgresCodes.has(code)) return { category: "POSTGRES", code };
  if (typeof code === "string" && transportCodes.has(code)) return { category: "TRANSPORT", code };

  const name = ownValue(error, "name");
  if (name === "DiscordApiError") {
    const kind = ownValue(error, "kind");
    if (kind === "UNAUTHORIZED" || kind === "UNAVAILABLE") {
      const status = ownValue(error, "status");
      return {
        category: "DISCORD_API",
        kind,
        status:
          typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
            ? status
            : null,
      };
    }
  }
  if (name === "TimeoutError") return { category: "TRANSPORT", code: "REQUEST_TIMEOUT" };
  if (name === "AbortError") return { category: "TRANSPORT", code: "REQUEST_ABORTED" };

  // Exact application literals become fixed reason codes; no message is copied to the log.
  const message = ownValue(error, "message");
  const reason = typeof message === "string" ? validationReasons.get(message) : undefined;
  return reason ? { category: "VALIDATION", reason } : undefined;
}

/** Build a new, bounded allowlist DTO; never retain any part of the original error. */
export function getSignInFailureDiagnostics(
  stage: SignInFailureStage,
  error: unknown,
): SignInFailureDiagnostics {
  const safeStage =
    stage === "DISCORD_GUILD_CHECK"
      ? "DISCORD_GUILD_CHECK"
      : stage === "ACCOUNT_PERSISTENCE"
        ? "ACCOUNT_PERSISTENCE"
        : "UNKNOWN";
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8; depth++) {
    if (current === null || (typeof current !== "object" && typeof current !== "function")) break;
    if (seen.has(current)) break;
    seen.add(current);
    const diagnostic = classify(current);
    if (diagnostic) return { stage: safeStage, ...diagnostic };
    current = ownValue(current, "cause");
  }
  return { stage: safeStage, category: "UNKNOWN" };
}

export function logSignInFailure(stage: SignInFailureStage, error: unknown): void {
  try {
    console.error("AUTH_SIGNIN_FAILURE", getSignInFailureDiagnostics(stage, error));
  } catch {
    // Diagnostics must not change authentication behavior, even if the logger is unavailable.
  }
}
