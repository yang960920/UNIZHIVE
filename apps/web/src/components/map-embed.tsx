"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Expand, ExternalLink, Map } from "lucide-react";
import { Badge } from "@uniz/ui";
import { ONCE_HUMAN_MAPS, type OnceHumanMapKey } from "@uniz/integrations";
import { mapHref, type MapView } from "@/lib/map-navigation";
import { getFarmingTargets } from "@/lib/map-farming";
import { FarmingAcquisitionNote } from "./farming-acquisition-note";
import {
  getMapLocationChoices,
  getSiloLocations,
  isSiloLocation,
  mapLocationHref,
} from "../lib/map-locations";
import { MapLocationInfo } from "./map-location-info";
import { useUserPreferences } from "./user-preferences-provider";
import { serializeMapSelection } from "@/lib/map-preferences";
import "./map-embed.css";

function MapFrame({ view }: { view: MapView }) {
  const place = view.mapLocation ?? view.farmingSite;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  return (
    <div className="map-frame">
      {loading && (
        <p className="map-loading" role="status">
          지도를 불러오는 중입니다…
        </p>
      )}
      <iframe
        className="map-embed"
        src={view.embedUrl}
        title={`TH.GL ${view.map.label}${place ? ` · ${place.label}` : ""} 인터랙티브 지도`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
      />
      {failed && (
        <p className="map-help" role="alert">
          지도를 불러오지 못했습니다. 위의 원본 지도에서 다시 확인해 주세요.
        </p>
      )}
    </div>
  );
}

export function MapEmbed({
  view,
  selectionCookieName,
}: {
  view: MapView;
  selectionCookieName?: string | null;
}) {
  const router = useRouter();
  const { preferences } = useUserPreferences();
  useEffect(() => {
    if (!selectionCookieName) return;
    const maxAge = preferences.rememberMapFilters ? 60 * 60 * 24 * 365 : 0;
    const value = preferences.rememberMapFilters
      ? encodeURIComponent(serializeMapSelection(view))
      : "";
    document.cookie = `${selectionCookieName}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  }, [view, selectionCookieName, preferences.rememberMapFilters]);
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const farmingTargets = getFarmingTargets(view.map.key);
  const locations = getMapLocationChoices(view.map.key);
  const infoLocation = view.mapLocation ?? view.farmingSite;
  const infoGuide = view.locationGuide ?? view.farmingSiteGuide;
  const showSilos =
    infoLocation && (infoLocation.key === "locations-silos" || isSiloLocation(infoLocation));
  const silos = showSilos ? getSiloLocations(view.map.key) : [];
  const locationChoice =
    view.requestedLocation && isSiloLocation(view.requestedLocation) && view.mapLocation
      ? "locations-silos"
      : (view.requestedLocation?.key ?? "");
  const siloList =
    silos.length > 0 ? (
      <details className="map-silo-list" open={infoLocation?.key === "locations-silos"}>
        <summary>사일로 목록 · {silos.length}곳</summary>
        <p>이름을 클릭하면 해당 사일로로 이동하고 드랍 정보를 표시합니다.</p>
        <nav aria-label="개별 사일로 선택">
          {silos.map((silo) => (
            <Link
              key={silo.key}
              href={mapLocationHref(view.map.key, silo.key)}
              prefetch={false}
              scroll={false}
              aria-current={infoLocation?.key === silo.key ? "location" : undefined}
            >
              {silo.label.replace(/^사일로 /, "")}
            </Link>
          ))}
        </nav>
      </details>
    ) : null;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(view.href, window.location.origin).toString());
      setFailed(false);
      setMessage("선택한 지도 링크를 복사했습니다.");
    } catch {
      setFailed(true);
      setMessage("링크를 복사하지 못했습니다. 브라우저 주소를 직접 복사해 주세요.");
    }
  }
  async function fullscreen() {
    try {
      if (!container.current?.requestFullscreen) throw new Error();
      await container.current.requestFullscreen();
    } catch {
      setFailed(true);
      setMessage("이 브라우저에서는 전체 화면을 열 수 없습니다. 원본 지도를 이용해 주세요.");
    }
  }
  return (
    <div ref={container} className="map-preview">
      <div className="map-toolbar">
        <div className="map-toolbar-label">
          <Map size={17} aria-hidden="true" />
          <span>ONCE HUMAN · TH.GL</span>
          <Badge>{view.map.label}</Badge>
        </div>
        <div className="map-toolbar-actions">
          <button className="button button-quiet" onClick={copyLink}>
            <Copy size={14} />
            지도 링크 복사
          </button>
          <button className="button button-quiet" onClick={fullscreen}>
            <Expand size={14} />
            전체 화면
          </button>
          <a
            className="button button-quiet"
            href={view.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            원본 지도 <ExternalLink size={14} />
          </a>
        </div>
      </div>
      <form className="map-controls" action="/map" method="get">
        <label>
          시나리오 지도
          <select
            name="scenario"
            value={view.map.key}
            onChange={(event) =>
              router.push(
                mapHref(
                  event.target.value as OnceHumanMapKey,
                  null,
                  view.requestedTarget?.key,
                  view.requestedLocation?.key,
                ),
                { scroll: false },
              )
            }
          >
            {ONCE_HUMAN_MAPS.map((map) => (
              <option key={map.key} value={map.key}>
                {map.label}
              </option>
            ))}
          </select>
        </label>
        <label className="map-share-field">
          TH.GL 공유 코드
          <input
            name="share"
            defaultValue={view.shareCode ?? ""}
            maxLength={128}
            pattern={"[a-zA-Z0-9_\\-]{1,128}"}
            placeholder="공유 코드를 입력하면 경로·필터를 표시합니다"
            aria-describedby="map-share-help"
          />
        </label>
        <div className="map-share-actions">
          <button type="submit" className="button button-primary">
            공유 코드 적용
          </button>
          {view.shareCode && (
            <Link className="button button-quiet" href={mapHref(view.map.key)} prefetch={false}>
              공유 코드 해제
            </Link>
          )}
        </div>
      </form>
      <form className="map-farming-controls" action="/map" method="get">
        <input type="hidden" name="scenario" value={view.map.key} />
        <label>
          파밍 대상
          <select
            name="target"
            value={view.requestedTarget?.key ?? ""}
            aria-describedby="map-farming-help"
            onChange={(event) =>
              router.push(mapHref(view.map.key, null, event.target.value), { scroll: false })
            }
          >
            <option value="">전체 지도</option>
            {view.requestedTarget && !view.farmingTarget && (
              <option value={view.requestedTarget.key} disabled>
                {view.requestedTarget.label} · 이 지도에서 필터 미확인
              </option>
            )}
            {(
              [
                ["deviant", "감염물"],
                ["material", "동물 재료"],
                ["resource", "광물·자원"],
              ] as const
            ).map(([kind, label]) => (
              <optgroup key={kind} label={label}>
                {farmingTargets
                  .filter((target) => target.kind === kind)
                  .map((target) => (
                    <option key={target.key} value={target.key}>
                      {target.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="submit" className="button button-quiet">
          파밍 대상 적용
        </button>
        {view.requestedTarget && (
          <Link className="button button-quiet" href={mapHref(view.map.key)} prefetch={false}>
            필터 해제
          </Link>
        )}
        <p id="map-farming-help">
          {view.farmingTarget ? (
            <>
              <strong>{view.farmingTarget.label}</strong> 출현·획득 위치 후보를 표시합니다.{" "}
            </>
          ) : (
            <>필요한 감염물이나 재료를 선택하면 출현·획득 위치 후보를 표시합니다. </>
          )}
          마커는 실시간 출현을 보장하지 않습니다. 시나리오와 획득 조건을 함께 확인하세요.
          {view.farmingTarget?.scopeNote && <> {view.farmingTarget.scopeNote}</>}
          {view.farmingSite && (
            <>
              {" "}
              {view.farmingSite.label}를 중심으로 표시합니다. 획득 안내의 다른 경로도 함께
              확인하세요.
            </>
          )}
        </p>
        <FarmingAcquisitionNote guide={view.farmingGuide} />
      </form>
      <form className="map-location-controls" action="/map" method="get">
        <input type="hidden" name="scenario" value={view.map.key} />
        <label>
          장소·드랍 정보
          <select
            name="location"
            value={locationChoice}
            aria-describedby="map-location-help"
            onChange={(event) =>
              router.push(mapLocationHref(view.map.key, event.target.value), { scroll: false })
            }
          >
            <option value="">장소 선택</option>
            {view.requestedLocation && !view.mapLocation && (
              <option value={view.requestedLocation.key} disabled>
                {view.requestedLocation.label} · 이 지도에서 필터 미확인
              </option>
            )}
            {(
              [
                ["DUNGEON", "던전·보스"],
                ["ACTIVITY", "생산·활동"],
                ["EXPLORATION", "탐험·보급"],
                ["FACILITY", "시설·이동"],
              ] as const
            ).map(([group, label]) => (
              <optgroup key={group} label={label}>
                {locations
                  .filter((location) => location.group === group)
                  .map((location) => (
                    <option key={location.key} value={location.key}>
                      {location.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="submit" className="button button-quiet">
          장소 보기
        </button>
        {view.requestedLocation && (
          <Link className="button button-quiet" href={mapHref(view.map.key)} prefetch={false}>
            장소 필터 해제
          </Link>
        )}
        <p id="map-location-help">
          장소를 선택하면 지도 필터와 보상 안내를 표시합니다. 사일로는 지도 옆 목록에서 이름을
          클릭해 이동하고 개별 드랍 정보를 확인하세요.
        </p>
      </form>
      <div className="map-help" id="map-share-help">
        <p>
          TH.GL에서 만든 경로·필터의 공유 코드를 적용하고, 지도 링크를 하이브 멤버와 나눠보세요.
          시나리오를 바꾸면 공유 코드는 해제됩니다.
        </p>
        {view.invalidShare && (
          <p role="alert" className="map-feedback is-error">
            공유 코드 형식을 확인해 주세요. 해당 공유 코드는 적용하지 않았습니다.
          </p>
        )}
        {view.invalidLocation && (
          <p role="alert" className="map-feedback is-error">
            확인되지 않은 장소입니다. 전체 지도를 표시합니다.
          </p>
        )}
        {view.requestedLocation && !view.mapLocation && (
          <p role="status" className="map-feedback is-error">
            {view.requestedLocation.label}의 지도 필터는 이 시나리오에서 아직 확인되지 않았습니다.
          </p>
        )}
        {view.invalidTarget && (
          <p role="alert" className="map-feedback is-error">
            확인되지 않은 파밍 대상입니다. 전체 지도를 표시합니다.
          </p>
        )}
        {view.requestedTarget && !view.farmingTarget && (
          <p role="status" className="map-feedback is-error">
            {view.requestedTarget.label}의 필터는 이 지도에서 아직 확인되지 않았습니다. 전체 지도를
            표시합니다.
          </p>
        )}
        {view.shareOverridden && (
          <p role="status" className="map-feedback">
            선택한 대상·장소를 확인할 수 있도록 공유 코드가 해제되었습니다.
          </p>
        )}
        {message && (
          <p
            role={failed ? "alert" : "status"}
            className={`map-feedback${failed ? " is-error" : ""}`}
          >
            {message}
          </p>
        )}
      </div>
      <div className={`map-content${infoLocation ? " has-location" : ""}`}>
        <MapFrame key={view.embedUrl} view={view} />
        {infoLocation && infoGuide && (
          <MapLocationInfo location={infoLocation} guide={infoGuide}>
            {siloList}
          </MapLocationInfo>
        )}
      </div>
      <div className="map-attribution">
        <span>Interactive map by TH.GL · {view.map.mapName}</span>
        <a href={view.originalUrl} target="_blank" rel="noopener noreferrer">
          TH.GL에서 지도 보기 ↗
        </a>
      </div>
    </div>
  );
}
