import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const boundary = vi.hoisted(() => ({
  state: [] as unknown[],
  index: 0,
  pending: Promise.resolve() as Promise<unknown>,
  save: vi.fn(),
  update: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = boundary.index++;
    if (!(index in boundary.state)) boundary.state[index] = initial;
    return [
      boundary.state[index],
      (value: unknown) => {
        boundary.state[index] = typeof value === "function" ? value(boundary.state[index]) : value;
      },
    ];
  },
  useTransition: () => [
    false,
    (action: () => Promise<unknown>) => {
      boundary.pending = action();
    },
  ],
}));
vi.mock("@/components/user-preferences-provider", () => ({
  useUserPreferences: () => ({ updatePreferences: boundary.update }),
}));
vi.mock("@/components/session-keeper", () => ({ stopSessionRenewal: vi.fn() }));
vi.mock("@/lib/user-preferences", () => import("../src/lib/user-preferences"));
vi.mock("@/lib/scenario-presets", () => import("../src/lib/scenario-presets"));
vi.mock("@/lib/user-preferences-actions", () => ({ saveUserPreferences: boundary.save }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@uniz/ui", () => ({ Card: "Card" }));

import { DEFAULT_USER_PREFERENCES } from "../src/lib/user-preferences";
import { PreferencesForm } from "../src/app/settings/preferences-form";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function render() {
  boundary.index = 0;
  return elements(PreferencesForm({ initial: { ...DEFAULT_USER_PREFERENCES } }));
}
function control(nodes: Element[], name: string) {
  return nodes.find((node) => node.props.name === name)!;
}
function submit(nodes: Element[]) {
  const onSubmit = nodes.find((node) => node.type === "form")!.props.onSubmit as (event: {
    preventDefault: () => void;
  }) => void;
  onSubmit({ preventDefault: vi.fn() });
  return boundary.pending;
}
function change(nodes: Element[], name: string, value: unknown, checkbox = false) {
  const onChange = control(nodes, name).props.onChange as (event: {
    target: { checked?: unknown; value?: unknown };
  }) => void;
  onChange({ target: checkbox ? { checked: value } : { value } });
}

beforeEach(() => {
  boundary.state = [];
  boundary.index = 0;
  boundary.pending = Promise.resolve();
  boundary.save.mockReset().mockImplementation(async (preferences) => ({
    ok: true,
    message: "저장했습니다.",
    preferences,
  }));
  boundary.update.mockClear();
});

describe("account preference saving", () => {
  it("does not save unchanged settings", async () => {
    await submit(render());
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.update).not.toHaveBeenCalled();
  });

  it("saves the full draft and applies only confirmed server preferences", async () => {
    let nodes = render();
    change(nodes, "showGuide", !DEFAULT_USER_PREFERENCES.showGuide, true);
    nodes = render();
    change(nodes, "reminderMinutes", "60");
    nodes = render();
    await submit(nodes);
    const expected = {
      ...DEFAULT_USER_PREFERENCES,
      showGuide: !DEFAULT_USER_PREFERENCES.showGuide,
      reminderMinutes: 60,
    };
    expect(boundary.save).toHaveBeenCalledExactlyOnceWith(expected);
    expect(boundary.update).toHaveBeenCalledExactlyOnceWith(expected);
    nodes = render();
    expect(
      nodes.find((node) => node.type === "button" && node.props.type === "submit")?.props.disabled,
    ).toBe(true);
  });

  it.each(["returned", "thrown"] as const)(
    "preserves unsaved changes after a %s save failure",
    async (failure) => {
      if (failure === "returned")
        boundary.save.mockResolvedValue({ ok: false, message: "다시 시도해주세요." });
      else boundary.save.mockRejectedValue(new Error("Unavailable"));
      change(render(), "showGuide", !DEFAULT_USER_PREFERENCES.showGuide, true);
      await submit(render());
      const nodes = render();
      expect(boundary.update).not.toHaveBeenCalled();
      expect(control(nodes, "showGuide").props.checked).toBe(!DEFAULT_USER_PREFERENCES.showGuide);
      expect(nodes.some((node) => node.props.role === "alert")).toBe(true);
      expect(
        nodes.find((node) => node.type === "button" && node.props.type === "submit")?.props
          .disabled,
      ).toBe(false);
    },
  );

  it("lets unsaved changes be cancelled without saving", () => {
    change(render(), "textSize", "LARGE");
    let nodes = render();
    const cancel = nodes.find(
      (node) => node.type === "button" && node.props.children === "변경 취소",
    )!;
    (cancel.props.onClick as () => void)();
    nodes = render();
    expect(control(nodes, "textSize").props.value).toBe(DEFAULT_USER_PREFERENCES.textSize);
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.update).not.toHaveBeenCalled();
  });

  it("keeps a reset as an unsaved draft until the user saves", async () => {
    change(render(), "showGuide", !DEFAULT_USER_PREFERENCES.showGuide, true);
    await submit(render());
    boundary.save.mockClear();
    boundary.update.mockClear();
    let nodes = render();
    const reset = nodes.find((node) => node.type === "button" && node.props.children === "기본값")!;
    (reset.props.onClick as () => void)();
    nodes = render();
    expect(control(nodes, "showGuide").props.checked).toBe(DEFAULT_USER_PREFERENCES.showGuide);
    expect(
      nodes.find((node) => node.type === "button" && node.props.type === "submit")?.props.disabled,
    ).toBe(false);
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.update).not.toHaveBeenCalled();
  });

  it("disables reminder timing when party reminders are disabled", () => {
    change(render(), "notifyPartyReminders", false, true);
    expect(control(render(), "reminderMinutes").props.disabled).toBe(true);
  });
});
