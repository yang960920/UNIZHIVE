import type { GearCatalogItem, GearTraitConflict } from "@uniz/build-engine";
import { gearDisplayName } from "./gear-editor-model";

const categoryByIcon: Record<string, string> = {
  "fusion_cbt2_icon_attribute2.png": "전투",
  "fusion_cbt2_icon_attribute3.png": "창조",
  "fusion_cbt2_icon_attribute6.png": "일반",
  "fusion_cbt2_icon_attribute7.png": "영지",
  "fusion_cbt2_icon_attribute8.png": "프리즘",
  "fusion_cbt2_icon_attribute11.png": "속성",
  "fusion_cbt2_icon_attribute12.png": "카오스",
  "fusion_ctb2_icon_attribute13.png": "융합",
};

export function gearTraitCategoryLabel(item: Readonly<GearCatalogItem> | undefined): string {
  const icon = item?.traitIconGroup ?? item?.icon?.split("/").at(-1);
  const category =
    item?.traitFusionMaterialType === "ANIMAL"
      ? "동물 융합"
      : item?.traitFusionMaterialType === "FURNITURE"
        ? "가구 융합"
        : (icon && categoryByIcon[icon]) || "특성";
  return item?.isDeviantShinyTrait ? `${category} · 이로치` : category;
}

export function gearTraitConflictMessage(
  conflict: GearTraitConflict,
  recordedNames?: Record<string, string>,
  candidateId?: string,
): string {
  const names = conflict.traitIds
    .filter((id) => id !== candidateId)
    .map((id) => gearDisplayName(id, recordedNames))
    .join(" · ");
  const rule =
    conflict.code === "DUPLICATE_SHINY"
      ? "이로치 특성은 1개만 등록할 수 있습니다."
      : "같은 아이콘의 특성은 1개만 등록할 수 있습니다.";
  return candidateId
    ? `${rule} 먼저 ‘${names}’ 특성을 해제해주세요.`
    : `${rule} 중복된 특성: ${names}. 하나만 남겨주세요.`;
}
