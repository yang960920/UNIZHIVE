import { Dashboard } from "@/components/dashboard";
import { getCurrentAuthState } from "@/lib/auth";
import { getOperationalPageData } from "@/lib/server/operational-repository";
import { LiveDashboard, OperationalAccessNotice } from "@/components/live-operations";
import { getSteamOverview } from "@/lib/server/steam-overview";
import { SteamOverview } from "@/components/steam-overview";
import { DashboardGuide } from "@/components/dashboard-guide";
export default async function HomePage() {
  const { user, status, retryAfterSeconds } = await getCurrentAuthState();
  const [provider, steamOverview] = await Promise.all([
    getOperationalPageData(user, status, retryAfterSeconds),
    getSteamOverview(),
  ]);
  if (provider.mode === "LIVE")
    return (
      <LiveDashboard
        data={provider.data}
        role={provider.role}
        name={user?.name}
        steamOverview={steamOverview}
      />
    );
  if (provider.mode !== "DEMO")
    return (
      <>
        <OperationalAccessNotice
          mode={provider.mode}
          retryAfterSeconds={provider.mode === "ERROR" ? provider.retryAfterSeconds : undefined}
        />
        <div className="home-public-steam">
          <SteamOverview data={steamOverview} />
          <DashboardGuide />
        </div>
      </>
    );
  return (
    <Dashboard
      userId={user?.id}
      role={user?.role}
      name={user?.name}
      steamOverview={steamOverview}
    />
  );
}
