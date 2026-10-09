"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, Copy, Package } from "lucide-react";
import type { OnceHumanMapKey } from "@uniz/integrations";
import {
  getDeviantFusionGuide,
  type DeviantFusionGuide,
  type GearSelection,
} from "@uniz/build-engine";
import { gearDisplayName } from "./gear-editor-model";
import { makeFusionPreparationText } from "./gear-fusion-guide-text";
import { GearFarmingMapLink } from "./gear-farming-map-link";
import styles from "./gear-fusion-guide.module.css";

type FusionTrait = DeviantFusionGuide["traits"][number];

function FusionIcon({ icon, name }: { icon: string | null; name: string }) {
  return (
    <span className={styles.icon}>
      {icon ? (
        <Image
          src={icon}
          alt=""
          width={64}
          height={64}
          sizes="48px"
          unoptimized
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Package size={24} aria-label={`${name} 아이콘 미확인`} />
      )}
    </span>
  );
}

function FusionMaterials({
  trait,
  scenario,
}: {
  trait: FusionTrait;
  scenario?: OnceHumanMapKey | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className={styles.materials} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>사용 가능한 동물·가구 {trait.directMaterials.length}종 보기</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      {open && (
        <ul className={styles.materialGrid}>
          {trait.directMaterials.map((material) => (
            <li key={material.id}>
              <FusionIcon icon={material.icon} name={material.name} />
              <div>
                <strong>{material.name}</strong>
                <span>{material.type === "ANIMAL" ? "동물 재료" : "가구 재료"}</span>
                {material.type === "ANIMAL" && (
                  <GearFarmingMapLink
                    kind="material"
                    id={material.id}
                    name={material.name}
                    scenario={scenario}
                  />
                )}
                {!material.directWithTarget && (
                  <p>
                    해당 특성을 가진 감염물을 먼저 준비해주세요.
                    {material.directCarrierNames.length > 0 && (
                      <> 직접 부여 대상: {material.directCarrierNames.join(" · ")}</>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function GearDeviantFusionGuide({
  selection,
  recordedNames,
  scenario,
}: {
  selection: GearSelection;
  recordedNames?: Record<string, string>;
  scenario?: OnceHumanMapKey | null;
}) {
  const [open, setOpen] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const guide = useMemo(
    () => (open ? getDeviantFusionGuide(selection.itemId, selection.traitIds) : null),
    [open, selection.itemId, selection.traitIds],
  );
  const text = guide ? makeFusionPreparationText(guide, selection) : "";
  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setCopyError("");
    } catch {
      setCopyError("복사하지 못했습니다. 아래 재료 이름을 확인해주세요.");
    }
  }
  return (
    <details className={styles.root} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={styles.toggle}>
        <span>융합 재료 보기</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      {open && (
        <div className={styles.body}>
          {guide ? (
            <>
              <div className={styles.target}>
                <FusionIcon icon={guide.target.icon} name={guide.target.name} />
                <div>
                  <span>완성 목표</span>
                  <strong>{guide.target.name}</strong>
                  <p>
                    어빌리티 {selection.abilityGrade ?? "미기록"} · 활성{" "}
                    {selection.activityGrade ?? "미기록"}
                  </p>
                </div>
              </div>
              <p className={styles.caption}>
                선택한 특성에 맞춰 게임 융합실에서 사용할 재료를 준비하세요.
              </p>
              <section className={styles.preparation} aria-label="융합 준비 순서">
                <div className={styles.sectionHeading}>
                  <h4>준비 순서</h4>
                  <span>메인 2개 + 보조 3칸</span>
                </div>
                <ol>
                  {guide.preparationNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ol>
              </section>
              <section className={styles.traits} aria-label="선택한 특성의 융합 재료">
                <h4>목표 특성과 재료</h4>
                {!guide.traits.length && (
                  <p className={styles.note}>
                    특성을 선택하면 해당 특성의 재료를 확인할 수 있습니다.
                  </p>
                )}
                {guide.traits.map((trait) => (
                  <article className={styles.trait} key={trait.id}>
                    <div className={styles.traitHeading}>
                      <FusionIcon icon={trait.icon} name={trait.name} />
                      <div>
                        <span>{trait.categoryLabel}</span>
                        <h5>{trait.name}</h5>
                      </div>
                    </div>
                    <p className={styles.effect}>
                      {trait.description || "효과 설명은 게임에서 확인해주세요."}
                    </p>
                    {!trait.applicable && (
                      <p className={styles.warning}>
                        선택한 감염물에 이 특성을 적용할 수 있는지 먼저 확인해주세요.
                      </p>
                    )}
                    {trait.directMaterials.length > 0 && (
                      <FusionMaterials trait={trait} scenario={scenario} />
                    )}
                    {trait.inheritanceAlternative && (
                      <p className={styles.note}>{trait.inheritanceNote}</p>
                    )}
                    {trait.unknownReason && <p className={styles.note}>{trait.unknownReason}</p>}
                    {trait.sourceUrl?.startsWith("https://") && (
                      <a href={trait.sourceUrl} target="_blank" rel="noopener noreferrer">
                        특성 자료 보기
                      </a>
                    )}
                  </article>
                ))}
              </section>
              <aside className={styles.cautions} aria-label="융합 전 확인">
                <h4>융합 전 확인</h4>
                {guide.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
                <p>{guide.gradeNote}</p>
              </aside>
              <div className={styles.footer}>
                <button type="button" className="button button-quiet" onClick={copy}>
                  {copiedText === text ? <Check size={15} /> : <Copy size={15} />}
                  {copiedText === text ? "준비 목록 복사됨" : "준비 목록 복사"}
                </button>
                {guide.sources.map((source) =>
                  source.url.startsWith("https://") ? (
                    <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.label}
                    </a>
                  ) : null,
                )}
              </div>
              {copyError && <p role="status">{copyError}</p>}
            </>
          ) : (
            <p className={styles.note}>
              {gearDisplayName(selection.itemId, recordedNames)}의 융합 재료는 아직 확인되지
              않았습니다. 게임 융합실에서 확인해주세요.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
