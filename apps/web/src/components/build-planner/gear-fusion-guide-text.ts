import type { DeviantFusionGuide, GearSelection } from "@uniz/build-engine";

export function makeFusionPreparationText(
  guide: DeviantFusionGuide,
  selection: Pick<GearSelection, "abilityGrade" | "activityGrade">,
): string {
  const lines = [
    `${guide.target.name} · 융합 준비 목록`,
    `목표 등급: 어빌리티 ${selection.abilityGrade ?? "미기록"} / 활성 ${selection.activityGrade ?? "미기록"}`,
    "",
    "준비 순서 (메인 2개 + 보조 3칸)",
    ...guide.preparationNotes.map((note, index) => `${index + 1}. ${note}`),
    "",
    "목표 특성과 재료",
  ];
  for (const trait of guide.traits) {
    lines.push(`- ${trait.name} (${trait.categoryLabel})`);
    if (trait.description) lines.push(`  효과: ${trait.description}`);
    for (const material of trait.directMaterials) {
      lines.push(
        `  ${material.type === "ANIMAL" ? "동물" : "가구"}: ${material.name}${material.directWithTarget ? "" : " (해당 특성을 가진 감염물을 먼저 준비)"}`,
      );
    }
    if (trait.inheritanceAlternative) lines.push(`  ${trait.inheritanceNote}`);
    if (trait.unknownReason) lines.push(`  ${trait.unknownReason}`);
    if (!trait.applicable) lines.push("  이 감염물에 적용 가능한 특성인지 확인이 필요합니다.");
  }
  lines.push("", "융합 전 확인", ...guide.warnings, guide.gradeNote);
  return lines.join("\n");
}
