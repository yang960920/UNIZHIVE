import type { LoadoutPreparationResult } from "@uniz/build-engine";
import { LoadoutCopyButton } from "./controls";

export function LoadoutPreparation({
  value,
  text,
}: {
  value: LoadoutPreparationResult;
  text: string;
}) {
  return (
    <div className="loadout-preparation">
      <section>
        <div className="loadout-heading">
          <h2>로드아웃 준비 목록</h2>
          <LoadoutCopyButton text={text} />
        </div>
        <p>
          공유 가능한 방어구를 한 번 준비하면 <strong>{value.counts.armorSaved}개</strong>를 줄일 수
          있습니다. 장비 총 <strong>{value.counts.uniqueEquipment}개</strong>, 음식·음료는 빌드마다
          1회 사용분으로 합산합니다.
        </p>
        <p className="loadout-status">
          {value.complete
            ? "선택한 재료의 준비 수량을 모두 확인했습니다."
            : "아직 선택하거나 확인할 재료가 있습니다. 아래 확정 합계는 전체 필요 재료가 아닙니다."}
        </p>
        <p>
          아래 합계는 장비 제작과 음식·음료 재료입니다. 모듈·감염물 획득과 장비 강화에 필요한 재료는
          별도로 준비해주세요.
        </p>
      </section>
      <section>
        <h2>겹치는 방어구</h2>
        <p>
          부위·방어구·가죽이 같은 구성을 표시합니다. 실제 재사용 수량은 제작 조건까지 같다고 확인된
          경우에 줄이며, 설정은 작성자가 조정합니다.
        </p>
        {value.sharedArmor.length ? (
          <ul>
            {value.sharedArmor.map((item) => (
              <li key={item.key}>
                <strong>{item.name}</strong> ·{" "}
                {item.tierDiffers
                  ? "제작 티어 다름"
                  : item.tier
                    ? `T${item.tier}`
                    : "제작 등급 미지정"}{" "}
                · {item.materialLabels.join(" / ") || "재료 미지정"}
                <br />
                {item.uses
                  .map((use) => `${use.buildTitle} v${use.version}`)
                  .filter((label, index, all) => all.indexOf(label) === index)
                  .join(" · ")}
                {item.settingsDiffer && (
                  <span className="loadout-warning"> · 모듈·기록 설정이 다릅니다.</span>
                )}
                {item.reuseConfirmed === false && (
                  <span className="loadout-warning">
                    {" "}
                    · 제작 조건이 다르거나 미기록 · 수량은 별도 확인
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>확인된 공통 방어구가 없습니다.</p>
        )}
      </section>
      <section>
        <h2>장비 준비 수량</h2>
        <div className="loadout-table-wrap">
          <table>
            <thead>
              <tr>
                <th>장비</th>
                <th>제작 등급</th>
                <th>선택 재료·튜닝</th>
                <th>필요 수량</th>
              </tr>
            </thead>
            <tbody>
              {value.equipment.map((item) => (
                <tr key={item.key}>
                  <td>
                    {item.name}
                    {item.settingsDiffer && <small>설정 다름</small>}
                  </td>
                  <td>{item.tier ? `T${item.tier}` : "미지정"}</td>
                  <td>
                    {[...item.materialLabels, ...(item.tuningName ? [item.tuningName] : [])].join(
                      " / ",
                    ) || "미지정"}
                  </td>
                  <td>
                    {item.quantity}개{!item.materialComplete && <small>재료 확인 필요</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>음식·음료 준비</h2>
        {value.consumables.length ? (
          <ul>
            {value.consumables.map((item) => (
              <li key={item.key}>
                <strong>{item.name}</strong> · {item.quantity}회분 ·{" "}
                {item.materialLabels.join(" / ") || "재료 미지정"}
                {!item.materialComplete && <span> · 재료 확인 필요</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p>선택한 음식·음료가 없습니다.</p>
        )}
      </section>
      <section>
        <h2>확정된 제작·도핑 재료 합계</h2>
        <p>
          재사용이 확정된 공통 장비는 한 번 제작하고, 음식·음료는 각 빌드의 사용분을 더한
          수량입니다.
        </p>
        {value.materials.length ? (
          <div className="loadout-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>재료</th>
                  <th>확정 수량</th>
                  <th>사용처</th>
                </tr>
              </thead>
              <tbody>
                {value.materials.map((material) => (
                  <tr key={material.id}>
                    <td className={`loadout-rarity-${material.rarity?.toLowerCase() ?? "unknown"}`}>
                      {material.name}
                    </td>
                    <td>{material.quantity}개</td>
                    <td>
                      <details>
                        <summary>{material.sources.length}개 사용처</summary>
                        <ul>
                          {material.sources.map((source, index) => (
                            <li key={`${source.key}-${index}`}>
                              {source.name} · {source.quantity}개
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>아직 확정할 수 있는 재료가 없습니다.</p>
        )}
      </section>
      {value.unresolved.length > 0 && (
        <section>
          <h2>선택·확인이 필요한 항목</h2>
          <ul className="loadout-warning">
            {value.unresolved.map((issue, index) => (
              <li key={`${issue.buildId}-${index}`}>
                {issue.buildTitle} · {issue.name}: {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
