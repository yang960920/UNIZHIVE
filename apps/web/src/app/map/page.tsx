import { PageHeader } from "@uniz/ui";
import { MapEmbed } from "@/components/map-embed";
import { getMapView } from "@/lib/map-navigation";
import { cookies } from "next/headers";
import { getCurrentAuthState } from "@/lib/auth";
import { getUserPreferences } from "@/lib/server/user-preferences";
import { getCurrentPreferredMap } from "@/lib/server/map-preferences";
import { mapSelectionCookieName, resolveMapPreferenceQuery } from "@/lib/map-preferences";
import { DEFAULT_USER_PREFERENCES } from "@/lib/user-preferences";

export const metadata = { title: "시나리오 지도" };

export default async function MapPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = await getCurrentAuthState();
  const user = state.status === "AUTHENTICATED" ? state.user : null;
  const preferences = await getUserPreferences(user).catch(() => DEFAULT_USER_PREFERENCES);
  const cookieName = user ? mapSelectionCookieName(user.id) : null;
  const remembered = cookieName ? (await cookies()).get(cookieName)?.value : undefined;
  const currentMap =
    preferences.mapScenario === "CURRENT"
      ? await getCurrentPreferredMap(state).catch(() => "MANIBUS" as const)
      : "MANIBUS";
  const view = getMapView(
    resolveMapPreferenceQuery(
      searchParams ? await searchParams : {},
      preferences,
      currentMap,
      remembered,
    ),
  );
  return (
    <>
      <PageHeader
        eyebrow="EXPLORE TOGETHER"
        title="우리의 다음 탐험"
        description="감염물·재료의 위치와 장소별 보상 조건을 확인하고, 탐험 경로를 함께 공유하세요."
      />
      <MapEmbed key={view.href} view={view} selectionCookieName={cookieName} />
    </>
  );
}
