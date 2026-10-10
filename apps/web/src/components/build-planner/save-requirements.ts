export interface PlannerSaveBlocker {
  message: string;
  targetId?: string;
}

export function buildTitleError(title: string): string | null {
  const length = title.trim().length;
  if (!length) return "빌드 이름을 입력해 주세요. 앞뒤 공백을 제외하고 2~100자입니다.";
  if (length < 2 || length > 100)
    return "빌드 이름은 앞뒤 공백을 제외하고 2~100자로 입력해 주세요.";
  return null;
}

export function getPlannerSaveBlockers({
  title,
  preview = false,
  ready = true,
  mediaReady = true,
  extraBlockers = [],
}: {
  title: string;
  preview?: boolean;
  ready?: boolean;
  mediaReady?: boolean;
  extraBlockers?: PlannerSaveBlocker[];
}): PlannerSaveBlocker[] {
  const blockers: PlannerSaveBlocker[] = [];
  if (preview)
    blockers.push({
      message: "미리보기에서는 저장할 수 없습니다. 승인된 Discord 계정으로 로그인해 주세요.",
    });
  if (!ready) blockers.push({ message: "입력 화면을 준비하고 있습니다. 잠시 기다려 주세요." });
  const titleError = buildTitleError(title);
  if (titleError) blockers.push({ message: titleError, targetId: "planner-title" });
  if (!mediaReady && !preview)
    blockers.push({
      message:
        "본문·이미지 준비가 끝나지 않았습니다. 빌드 설명에서 업로드 상태나 오류를 확인해 주세요.",
      targetId: "planner-description",
    });
  return [...blockers, ...extraBlockers].filter(
    (blocker, index, all) =>
      all.findIndex(
        (item) => item.message === blocker.message && item.targetId === blocker.targetId,
      ) === index,
  );
}
