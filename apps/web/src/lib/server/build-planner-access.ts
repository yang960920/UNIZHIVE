import "server-only";
import { canViewMemberDirectory } from "@uniz/domain";
import { getCurrentAuthState } from "../auth";

export async function getPlannerAccess() {
  const authorization = await getCurrentAuthState();
  return {
    ...authorization,
    preview: authorization.user?.isMock === true,
    mayCreate:
      authorization.status === "AUTHENTICATED" &&
      Boolean(
        authorization.user &&
        !authorization.user.isMock &&
        canViewMemberDirectory(authorization.user),
      ),
  };
}
