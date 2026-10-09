import { getGearArmorSet } from "@uniz/build-engine";
import "./gear-armor-summary.css";

export function GearArmorSetEffects({
  sets,
}: {
  sets: readonly { setId: string; count: number }[];
}) {
  if (!sets.length) return null;
  return (
    <section className="gear-set-effects" aria-label="방어구 세트 효과">
      <h3>세트 효과</h3>
      <div className="gear-set-effect-grid">
        {sets.map(({ setId, count }) => {
          const set = getGearArmorSet(setId);
          return (
            <details key={setId} className="gear-set-effect-card" open={count >= 2}>
              <summary>
                <strong>{set?.displayName ?? "이전 세트 기록"}</strong>
                <span>{count}부위</span>
              </summary>
              {set ? (
                <ol>
                  {set.effects.map((effect) => (
                    <li
                      key={effect.pieces}
                      className={count >= effect.pieces ? "is-active" : "is-inactive"}
                    >
                      <span className="gear-set-threshold">{effect.pieces}세트</span>
                      <p>{effect.description}</p>
                      <small>{count >= effect.pieces ? "활성" : "미충족"}</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>이 세트의 효과를 확인하고 있습니다.</p>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
