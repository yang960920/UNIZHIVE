import { CommunityError } from "../../lib/community-policy";
import { getCurrentAuthState } from "../../lib/auth";
import { selectOperationalAccessMode } from "../../lib/operational-policy";
import { CommunityAccessNotice, CommunityReadFailure } from "./views";

export async function CommunityEditorFailure({
  error,
  retryHref,
  returnHref,
}: {
  error: unknown;
  retryHref: string;
  returnHref?: string;
}) {
  if (error instanceof CommunityError) {
    if (error.code === "FORBIDDEN") {
      const state = await getCurrentAuthState();
      const mode = selectOperationalAccessMode(state.user, state.status);
      if (mode !== "LIVE")
        return (
          <CommunityAccessNotice
            mode={mode}
            retryHref={retryHref}
            retryAfterSeconds={state.retryAfterSeconds}
          />
        );
    }
    if (error.code === "UNAVAILABLE")
      return <CommunityAccessNotice mode="ERROR" retryHref={retryHref} />;
    if (error.code === "UNAUTHENTICATED")
      return <CommunityAccessNotice mode="DEMO" retryHref={retryHref} />;
    if (error.code === "REAUTH" || error.code === "LEFT")
      return <CommunityAccessNotice mode={error.code} retryHref={retryHref} />;
    return <CommunityReadFailure message={error.message} returnHref={returnHref} />;
  }
  return <CommunityReadFailure returnHref={returnHref} />;
}
