import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlannerRequiredFields,
  PlannerSaveFeedback,
} from "../src/components/build-planner/save-feedback";

describe("build save feedback accessibility", () => {
  it("renders every blocker as a live description with links to the affected fields", () => {
    const html = renderToStaticMarkup(
      createElement(PlannerSaveFeedback, {
        id: "planner-save-status",
        blockers: [
          { message: "이름을 입력해 주세요.", targetId: "planner-title" },
          { message: "무기 레벨을 확인해 주세요.", targetId: "gear-slot-primary" },
        ],
        pending: false,
        saved: false,
      }),
    );
    expect(html).toContain('id="planner-save-status"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('href="#planner-title"');
    expect(html).toContain('href="#gear-slot-primary"');
    expect(html).toContain("이름을 입력해 주세요.");
    expect(html).toContain("무기 레벨을 확인해 주세요.");
  });

  it("reports saving and completion instead of irrelevant editor readiness blockers", () => {
    const props = {
      id: "planner-save-status",
      blockers: [{ message: "본문 준비가 끝나지 않았습니다." }],
      pending: true,
      saved: false,
    };
    const pending = renderToStaticMarkup(createElement(PlannerSaveFeedback, props));
    expect(pending).toContain("빌드를 저장하고 있습니다");
    expect(pending).not.toContain("본문 준비가 끝나지 않았습니다.");
    const saved = renderToStaticMarkup(
      createElement(PlannerSaveFeedback, { ...props, pending: false, saved: true }),
    );
    expect(saved).toContain("저장되었습니다.");
    expect(saved).not.toContain("본문 준비가 끝나지 않았습니다.");
  });

  it("explains optional fields and the conditional names or scenario required by selected gear", () => {
    const gear = renderToStaticMarkup(createElement(PlannerRequiredFields));
    expect(gear).toContain("빌드 이름");
    expect(gear).toContain("2~100자");
    expect(gear).toContain("선택 항목은 비워 두어도 저장할 수 있습니다.");
    expect(gear).toContain("시나리오 전용 장비");
    const legacy = renderToStaticMarkup(createElement(PlannerRequiredFields, { legacy: true }));
    expect(legacy).toContain("장비 항목이나 부옵션을 추가했다면 이름을 입력");
  });
});
