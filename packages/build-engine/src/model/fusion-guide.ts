import data from "../../data/fusion-guide-materials.json";
import { GEAR_CATALOG } from "./gear";
import { getGearTraitConflicts } from "./gear-traits";

export interface FusionGuideMaterial {
  id: string;
  sourceId: string;
  name: string;
  icon: string | null;
  type: "ANIMAL" | "FURNITURE";
  /** Material trait-source bonus and body transformation are distinct original rules. */
  directWithTarget: boolean;
  directCarrierNames: string[];
}

export interface FusionGuideTrait {
  id: string;
  name: string;
  icon: string | null;
  description: string;
  category: "GENERAL" | "COMBAT" | "SHINY" | "FUSION";
  categoryLabel: string;
  isShiny: boolean;
  directMaterials: FusionGuideMaterial[];
  inheritanceAlternative: boolean;
  inheritanceNote: string;
  unknownReason: string | null;
  sourceUrl: string | null;
  verifiedAt: string;
  applicable: boolean;
}

export interface DeviantFusionGuide {
  target: { id: string; name: string; icon: string | null };
  traits: FusionGuideTrait[];
  warnings: string[];
  preparationNotes: string[];
  gradeNote: string;
  sources: { label: string; url: string }[];
}

const catalogById = new Map(GEAR_CATALOG.map((item) => [item.id, item]));
const metadataById = new Map(data.traits.map((trait) => [trait.id, trait]));
const materialBySource = new Map(data.materials.map((material) => [material.sourceId, material]));

const sources = [
  {
    label: "공식 융합 시스템 소개",
    url: "https://www.oncehuman.game/news/update/20250919/40780_1260194.html",
  },
  {
    label: "커뮤니티 융합 재료·계승 안내",
    url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=228613",
  },
] as const;

/** A preparation guide only: no invented inventory, acquisition locations or result probabilities. */
export function getDeviantFusionGuide(
  deviantId: string,
  traitIds: readonly string[],
): DeviantFusionGuide | null {
  const target = catalogById.get(deviantId);
  if (target?.kind !== "DEVIANT") return null;

  const warnings: string[] = [];
  const selectedIds = [...new Set(traitIds)];
  const conflicts = getGearTraitConflicts(selectedIds);
  for (const conflict of conflicts) {
    const names = conflict.traitIds.map((id) => catalogById.get(id)?.name ?? id).join(" · ");
    warnings.push(
      conflict.code === "DUPLICATE_SHINY"
        ? `이로치 특성은 하나만 선택할 수 있습니다: ${names}`
        : `같은 아이콘의 특성은 함께 선택할 수 없습니다: ${names}`,
    );
  }

  const traits: FusionGuideTrait[] = [];
  for (const id of selectedIds) {
    const trait = catalogById.get(id);
    if (trait?.kind !== "DEVIANT_TRAIT") {
      warnings.push("목록에서 확인되지 않는 특성이 있어 재료를 안내할 수 없습니다.");
      continue;
    }
    const metadata = metadataById.get(id);
    const applicable = target.allowedTraitIds.includes(id);
    const isShiny = trait.isDeviantShinyTrait === true;
    const category = isShiny
      ? "SHINY"
      : trait.traitFusionMaterialType
        ? "FUSION"
        : metadata?.typeCode === 3
          ? "COMBAT"
          : "GENERAL";
    const categoryLabel = {
      SHINY: "이로치 특성",
      FUSION: "융합 특성",
      COMBAT: "전투형 특성",
      GENERAL: "일반 특성",
    }[category];

    const directMaterials: FusionGuideMaterial[] = [];
    for (const recipe of metadata?.materialRecipes ?? []) {
      const material = materialBySource.get(recipe.materialSourceId);
      if (!material) continue;
      // An empty material bonus whitelist permits all target species. The separate body recipe
      // is evidence of a transformation, not a universal ban on direct material trait sources.
      const materialBonusApplies =
        material.bonusTraitSourceId === trait.sourceId &&
        (material.bonusDeviantSourceIds.length === 0 ||
          (material.bonusDeviantSourceIds as readonly string[]).includes(target.sourceId ?? ""));
      const bodyRecipeApplies = recipe.bodyRecipeDeviantSourceIds.includes(target.sourceId ?? "");
      directMaterials.push({
        id: material.id,
        sourceId: material.sourceId,
        name: material.name,
        icon: material.icon,
        type: material.type as FusionGuideMaterial["type"],
        directWithTarget: applicable && (materialBonusApplies || bodyRecipeApplies),
        directCarrierNames: [...recipe.bodyRecipeDeviantNames],
      });
    }

    const inheritanceNote = !applicable
      ? "현재 선택한 감염물에 사용할 수 있는 특성으로 확인되지 않았습니다."
      : isShiny
        ? `이 특성이 붙은 ${target.displayName ?? target.name}을 준비하세요. 이로치 특성은 다른 종류로 옮기는 재료로 안내하지 않습니다.`
        : `${trait.displayName ?? trait.name} 특성을 이미 가진 감염물을 서브 재료로 준비할 수 있습니다. 다른 특성도 함께 확인하세요.`;
    if (!applicable)
      warnings.push(`${trait.displayName ?? trait.name}: 목표 감염물과 특성을 다시 확인하세요.`);
    traits.push({
      id,
      name: trait.displayName ?? trait.name,
      icon: trait.icon,
      description: trait.description,
      category,
      categoryLabel,
      isShiny,
      directMaterials,
      inheritanceAlternative: applicable,
      inheritanceNote,
      unknownReason: !applicable
        ? "목표 감염물과의 조합이 확인되지 않았습니다."
        : directMaterials.length === 0
          ? "개별 획득 위치는 아직 확인하지 않았습니다."
          : null,
      sourceUrl: trait.source.url,
      verifiedAt: data.verifiedAt,
      applicable,
    });
  }

  return {
    target: { id: target.id, name: target.displayName ?? target.name, icon: target.icon },
    traits,
    warnings: [...new Set(warnings)],
    preparationNotes: [
      `메인 2개: 융합 가능한 ${target.displayName ?? target.name} 두 개를 준비하세요. 복제할 때는 목표 특성을 가진 개체를 메인에 넣습니다.`,
      "서브는 최대 3칸입니다. 융합 횟수가 0인 감염물도 사용할 수 있으며, 넣은 서브 재료는 소모됩니다.",
      `메인 종류가 다르면 서브 3칸 중 하나에 ${target.displayName ?? target.name}이 필요합니다. 원하는 특성도 가진 개체를 준비하면 칸을 함께 활용할 수 있습니다.`,
      "선택한 특성을 가진 감염물 또는 아래 동물·가구를 준비하세요. 경쟁 특성과 실제 배치 결과는 게임 융합실에서 확인합니다.",
      "같은 아이콘의 특성은 함께 사용할 수 없으며, 이로치 특성은 하나만 선택할 수 있습니다.",
    ],
    gradeNote:
      "활성·어빌 등급은 별도입니다. 5/5 메인을 준비해도 결과 등급에는 랜덤성이 있으며, 이 안내는 등급 유지나 성공 확률을 계산하지 않습니다.",
    sources: sources.map((source) => ({ ...source })),
  };
}
