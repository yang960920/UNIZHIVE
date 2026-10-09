"use client";

import {
  memo,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Crosshair,
  Layers,
  Plus,
  Shield,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import {
  createEmptyGearLoadout,
  GEAR_CATALOG,
  getGearTraitConflicts,
  getEligibleGearAttachments,
  getEligibleGearItems,
  parseGearLoadoutForSave,
  type GearSelection,
  type GearSlot,
  type PlannerContext,
  type PlannerGearLoadout,
} from "@uniz/build-engine";
import { saveBuildPlanner } from "@/app/lab/actions";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { ContentEditor } from "@/components/content/editor";
import { YouTubeField } from "@/components/content/presentation";
import type {
  BuildVisibility,
  PlannerActionState,
  PlannerBuildDetail,
} from "@/lib/data/build-planner-types";
import { armorSetLabels, scenarioLabels, visibilityLabels } from "./presentation-labels";
import { GearCatalogPicker, GearIcon, GearItemInfo, rarityLabels } from "./gear-catalog-picker";
import { GearTraitSelector } from "./gear-trait-picker";
import { GearDeviantFusionGuide } from "./gear-fusion-guide";
import { gearTraitConflictMessage } from "./gear-trait-presentation";
import { GearArmorSetEffects } from "./gear-armor-summary";
import { GearConsumablesEditor } from "./gear-consumables";
import { consumableSelectionError } from "./gear-consumables-model";
import {
  armorSlots,
  attachmentLabels,
  changeGearAttachment,
  contentChoices,
  countGearArmorSets,
  cradleSlots,
  cradleCompatibilityNote,
  equipGearItem,
  emptySlotIcons,
  gearItemById,
  gearDisplayName,
  gearSlotLabels,
  parseGearNumber,
  tagChoices,
  weaponSlots,
  type AttachmentKey,
} from "./gear-editor-model";
import "./editor.css";

type PickerTarget = { slot: GearSlot; attachment?: AttachmentKey };
type NumericField = "level" | "abilityGrade" | "activityGrade" | "moduleLevel";
const subscribeToReady = () => () => {};
const readyOnClient = () => true;
const readyOnServer = () => false;

const SlotCard = memo(function SlotCard({
  slot,
  selection,
  savedName,
  active,
  onOpen,
  onFocus,
}: {
  slot: GearSlot;
  selection?: GearSelection;
  savedName?: string;
  active: boolean;
  onOpen: (slot: GearSlot) => void;
  onFocus: (slot: GearSlot) => void;
}) {
  const item = selection ? gearItemById.get(selection.itemId) : undefined;
  const equippedModule = selection?.attachments.module
    ? gearItemById.get(selection.attachments.module)
    : undefined;
  return (
    <article
      className={`gear-slot rarity-${item?.rarity?.toLowerCase() ?? "unknown"} ${active ? "is-active" : ""}`}
    >
      <button
        type="button"
        id={`gear-slot-${slot}`}
        className="gear-slot-main"
        onFocus={() => onFocus(slot)}
        onClick={() => (selection ? onFocus(slot) : onOpen(slot))}
        aria-label={`${gearSlotLabels[slot]} ${savedName ?? item?.name ?? "선택"}`}
        aria-pressed={active}
      >
        <span className="gear-slot-label">{gearSlotLabels[slot]}</span>
        <GearIcon item={item} fallbackIcon={!selection ? emptySlotIcons[slot] : undefined} />
        <span className="gear-slot-name">
          {savedName ?? item?.name ?? (selection ? "이전 장비 기록" : "장비 선택")}
        </span>
        <span className="gear-slot-caption">
          {selection?.level
            ? `Lv. ${selection.level}`
            : item?.rarity
              ? rarityLabels[item.rarity]
              : ""}
        </span>
        {item?.isKeyArmor && <span className="gear-key-badge">핵심</span>}
        {!selection && <Plus size={16} className="gear-slot-plus" aria-hidden="true" />}
      </button>
      {selection && (
        <div className="gear-slot-bottom">
          <span>
            {weaponSlots.includes(slot) || armorSlots.includes(slot)
              ? (equippedModule?.name ?? "모듈 미선택")
              : "선택 변경"}
          </span>
          <button
            type="button"
            onClick={() => onOpen(slot)}
            aria-label={`${gearSlotLabels[slot]} 장비 변경`}
          >
            변경 <ChevronRight size={14} />
          </button>
        </div>
      )}
    </article>
  );
});

function TagSelector({
  label,
  options,
  values,
  maximum,
  onChange,
  allowCustom = true,
}: {
  label: string;
  options: readonly string[];
  values: string[];
  maximum: number;
  onChange: (values: string[]) => void;
  allowCustom?: boolean;
}) {
  const [query, setQuery] = useState("");
  const choices = useMemo(
    () =>
      [...new Set([...options, ...values])].filter((item) =>
        item.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR")),
      ),
    [options, values, query],
  );
  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : values.length < maximum
          ? [...values, value]
          : values,
    );
  }
  const custom = query.trim();
  return (
    <div className="gear-tag-selector">
      <label>
        {label} 검색
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={allowCustom ? `${label} 찾기 또는 직접 입력` : `${label} 찾기`}
          maxLength={40}
        />
      </label>
      <div className="gear-tag-options" aria-label={`${label} 선택`}>
        {choices.slice(0, 48).map((choice) => (
          <button
            type="button"
            key={choice}
            aria-pressed={values.includes(choice)}
            disabled={!values.includes(choice) && values.length >= maximum}
            onClick={() => toggle(choice)}
            className={values.includes(choice) ? "is-selected" : ""}
          >
            {choice}
          </button>
        ))}
      </div>
      {allowCustom && custom && ![...options, ...values].includes(custom) && (
        <button
          type="button"
          className="gear-custom-tag"
          disabled={values.length >= maximum}
          onClick={() => {
            toggle(custom);
            setQuery("");
          }}
        >
          <Plus size={13} /> ‘{custom}’ 추가
        </button>
      )}
      {values.length > 0 && <p className="gear-tag-selection">선택됨: {values.join(" · ")}</p>}
    </div>
  );
}

export function GearPlannerEditor({
  initial,
  preview = false,
}: {
  initial?: PlannerBuildDetail;
  preview?: boolean;
}) {
  const router = useRouter();
  const { preferences } = useUserPreferences();
  const ready = useSyncExternalStore(subscribeToReady, readyOnClient, readyOnServer);
  const [baseBuildId] = useState(() => initial?.id ?? null);
  const [baseVersionStamp] = useState(() => initial?.updatedAt ?? null);
  const [baseSourceVersion] = useState(() => initial?.selectedVersion.version ?? null);
  const [draft, setDraft] = useState<PlannerGearLoadout>(() =>
    initial?.selectedVersion.loadout?.schemaVersion === "uniz-gear.v2"
      ? initial.selectedVersion.loadout
      : createEmptyGearLoadout(),
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<BuildVisibility>(
    initial?.visibility ?? preferences.defaultBuildVisibility,
  );
  const [notes, setNotes] = useState("");
  const [mediaReady, setMediaReady] = useState(true);
  const [focusedSlot, setFocusedSlot] = useState<GearSlot>("primary");
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [choiceMessage, setChoiceMessage] = useState("");
  const [detailTab, setDetailTab] = useState<"module" | "accessories">("module");
  const [numberTexts, setNumberTexts] = useState<Record<string, string>>({});
  const [numberErrors, setNumberErrors] = useState<Record<string, string>>({});
  const returnFocus = useRef<HTMLElement | null>(null);
  const serialized = useMemo(() => JSON.stringify(draft), [draft]);
  const consumableError = consumableSelectionError(draft.consumables, draft.context.characterClass);
  const traitConflicts = useMemo(
    () =>
      draft.slots.flatMap((selection) => getGearTraitConflicts(selection.traitIds, GEAR_CATALOG)),
    [draft.slots],
  );
  const traitError = traitConflicts
    .map((conflict) => gearTraitConflictMessage(conflict, draft.catalogNames))
    .join(" ");
  const [state, submit, pending] = useActionState<PlannerActionState, FormData>(
    async (previous, form) => {
      if (previous.ok) return previous;
      if (preview) return { ok: false, message: "미리보기에서는 저장할 수 없습니다." };
      if (!mediaReady || form.get("contentMediaReady") === "false")
        return {
          ok: false,
          message: "본문의 이미지 준비 상태를 확인해 주세요. 입력은 유지됩니다.",
        };
      if (Object.values(numberErrors).some(Boolean))
        return { ok: false, message: "입력한 숫자를 확인해주세요. 작성 중인 내용은 유지됩니다." };
      if (traitError) return { ok: false, message: traitError };
      if (consumableError) return { ok: false, message: consumableError };
      try {
        form.set(
          "loadout",
          JSON.stringify(parseGearLoadoutForSave({ ...draft, catalogNames: {} })),
        );
      } catch {
        return {
          ok: false,
          message:
            "장비·모듈·부속품·도핑의 선택과 플레이 조건을 확인해주세요. 입력은 그대로 유지됩니다.",
        };
      }
      try {
        return await saveBuildPlanner(previous, form);
      } catch {
        return {
          ok: false,
          message: "저장하지 못했습니다. 입력은 유지됩니다. 연결을 확인한 후 다시 시도해주세요.",
        };
      }
    },
    { ok: false, message: "" },
  );
  useEffect(() => {
    if (state.ok && state.href) router.push(state.href);
  }, [state.ok, state.href, router]);

  const clearNumbers = useCallback((slot: GearSlot) => {
    const withoutSlot = (values: Record<string, string>) =>
      Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith(`${slot}.`)));
    setNumberTexts(withoutSlot);
    setNumberErrors(withoutSlot);
  }, []);
  const onFocus = useCallback((slot: GearSlot) => {
    setFocusedSlot(slot);
    setDetailTab("module");
  }, []);
  const onOpen = useCallback((slot: GearSlot) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFocusedSlot(slot);
    setChoiceMessage("");
    setPicker({ slot });
  }, []);
  function openAttachment(slot: GearSlot, attachment: AttachmentKey) {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPicker({ slot, attachment });
  }
  function updateSlot(slot: GearSlot, change: (selection: GearSelection) => GearSelection) {
    setDraft((previous) => ({
      ...previous,
      slots: previous.slots.map((selection) =>
        selection.slot === slot ? change(selection) : selection,
      ),
    }));
  }
  function updateContext<K extends keyof PlannerContext>(key: K, value: PlannerContext[K]) {
    setDraft((previous) => ({ ...previous, context: { ...previous.context, [key]: value } }));
  }
  function choose(id: string) {
    if (!picker) return;
    const chosenItem = gearItemById.get(id);
    const existingKey = draft.slots.find(
      (equipped) =>
        equipped.slot !== picker.slot &&
        armorSlots.includes(equipped.slot) &&
        gearItemById.get(equipped.itemId)?.isKeyArmor,
    );
    if (!picker.attachment && chosenItem?.isKeyArmor && existingKey) {
      setChoiceMessage(
        `핵심 방어구는 1개만 장착할 수 있습니다. ${gearSlotLabels[existingKey.slot]}의 ${gearDisplayName(existingKey.itemId, draft.catalogNames)}을 먼저 해제하거나 변경해주세요.`,
      );
      return;
    }
    const selection = draft.slots.find((item) => item.slot === picker.slot);
    if (picker.attachment) {
      updateSlot(picker.slot, (current) => changeGearAttachment(current, picker.attachment!, id));
      if (picker.attachment === "module" && selection?.attachments.module !== id) {
        const key = `${picker.slot}.moduleLevel`;
        setNumberTexts((values) =>
          Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)),
        );
        setNumberErrors((values) =>
          Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)),
        );
      }
    } else {
      setDraft((previous) => equipGearItem(previous, picker.slot, id));
      if (selection?.itemId !== id) clearNumbers(picker.slot);
    }
    setPicker(null);
    setChoiceMessage("");
  }
  function removeSlot(slot: GearSlot) {
    setDraft((previous) => ({
      ...previous,
      slots: previous.slots.filter((selection) => selection.slot !== slot),
    }));
    clearNumbers(slot);
  }
  function numberField(selection: GearSelection, field: NumericField, label: string) {
    const key = `${selection.slot}.${field}`;
    const value = field === "moduleLevel" ? selection.attachments.moduleLevel : selection[field];
    return (
      <label key={key}>
        {label}
        <input
          type="text"
          inputMode="numeric"
          maxLength={12}
          placeholder="미기록"
          value={numberTexts[key] ?? (value === null ? "" : String(value))}
          aria-invalid={Boolean(numberErrors[key])}
          onChange={(event) => {
            const text = event.target.value;
            setNumberTexts((previous) => ({ ...previous, [key]: text }));
            try {
              const number = parseGearNumber(text, field === "moduleLevel" ? 17 : 100);
              setNumberErrors((previous) => ({ ...previous, [key]: "" }));
              updateSlot(selection.slot, (current) =>
                field === "moduleLevel"
                  ? { ...current, attachments: { ...current.attachments, moduleLevel: number } }
                  : { ...current, [field]: number },
              );
            } catch (error) {
              setNumberErrors((previous) => ({
                ...previous,
                [key]: error instanceof Error ? error.message : "숫자를 확인해주세요.",
              }));
            }
          }}
        />
        {numberErrors[key] && (
          <small role="status" className="gear-error">
            {numberErrors[key]}
          </small>
        )}
      </label>
    );
  }

  const selectedBySlot = useMemo(
    () => new Map(draft.slots.map((selection) => [selection.slot, selection])),
    [draft.slots],
  );
  const focused = selectedBySlot.get(focusedSlot);
  const focusedItem = focused ? gearItemById.get(focused.itemId) : undefined;
  const focusedDisplayItem =
    focusedItem && draft.catalogNames?.[focusedItem.id]
      ? { ...focusedItem, name: gearDisplayName(focusedItem.id, draft.catalogNames) }
      : focusedItem;
  const focusedModule = focused?.attachments.module
    ? gearItemById.get(focused.attachments.module)
    : undefined;
  const pickerItems = useMemo(() => {
    if (!picker) return [];
    const selection = draft.slots.find((item) => item.slot === picker.slot);
    const eligible =
      picker.attachment && selection
        ? getEligibleGearAttachments(
            picker.slot,
            picker.attachment,
            selection.itemId,
            draft.context,
          )
        : getEligibleGearItems(picker.slot, draft.context);
    return picker.slot.startsWith("cradle-")
      ? eligible.filter(
          (item) =>
            !draft.slots.some(
              (equipped) =>
                equipped.slot !== picker.slot &&
                equipped.itemId === item.id &&
                equipped.slot.startsWith("cradle-"),
            ),
        )
      : eligible;
  }, [picker, draft.slots, draft.context]);
  const numericError = Object.values(numberErrors).find(Boolean);
  function handleDetailTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const hasAccessories = weaponSlots.includes(focusedSlot) && focusedSlot !== "melee";
    const next =
      !hasAccessories || event.key === "Home"
        ? "module"
        : event.key === "End"
          ? "accessories"
          : detailTab === "module"
            ? "accessories"
            : "module";
    setDetailTab(next);
    document.getElementById(next === "module" ? "gear-module-tab" : "gear-accessory-tab")?.focus();
  }
  const equipmentCount = draft.slots.filter(
    (selection) => weaponSlots.includes(selection.slot) || armorSlots.includes(selection.slot),
  ).length;
  const armorSets = useMemo(() => countGearArmorSets(draft.slots), [draft.slots]);
  const keyArmors = useMemo(
    () =>
      draft.slots.filter(
        (selection) =>
          armorSlots.includes(selection.slot) && gearItemById.get(selection.itemId)?.isKeyArmor,
      ),
    [draft.slots],
  );
  const disabledReasons = useMemo(() => {
    if (!picker || picker.attachment || !armorSlots.includes(picker.slot)) return {};
    const existingKey = keyArmors.find((selection) => selection.slot !== picker.slot);
    if (!existingKey) return {};
    const reason = `핵심 방어구 1개 제한 · ${gearSlotLabels[existingKey.slot]}에 ${gearDisplayName(existingKey.itemId, draft.catalogNames)} 장착 중`;
    return Object.fromEntries(
      pickerItems.filter((item) => item.isKeyArmor).map((item) => [item.id, reason]),
    );
  }, [picker, pickerItems, keyArmors, draft.catalogNames]);
  const renderSlot = (slot: GearSlot) => (
    <SlotCard
      key={slot}
      slot={slot}
      selection={selectedBySlot.get(slot)}
      savedName={
        selectedBySlot.get(slot)
          ? gearDisplayName(selectedBySlot.get(slot)!.itemId, draft.catalogNames)
          : undefined
      }
      active={focusedSlot === slot}
      onOpen={onOpen}
      onFocus={onFocus}
    />
  );

  return (
    <form action={submit} className="gear-editor">
      <fieldset
        disabled={!ready || pending || state.ok}
        aria-busy={!ready}
        className="gear-editor-fieldset"
      >
        {baseBuildId && (
          <>
            <input type="hidden" name="buildId" value={baseBuildId} />
            <input type="hidden" name="expectedUpdatedAt" value={baseVersionStamp ?? ""} />
          </>
        )}
        <input type="hidden" name="loadout" value={serialized} />
        <section className="gear-editor-top">
          <div>
            <span className="gear-eyebrow">EQUIPMENT LOADOUT</span>
            <h2>{baseBuildId ? "장비 구성 수정" : "나의 장비 구성"}</h2>
            {!ready && (
              <p className="gear-muted" role="status">
                장비 목록을 준비하고 있습니다…
              </p>
            )}
          </div>
          <div className="gear-build-fields">
            <label>
              빌드 이름
              <input
                name="title"
                required
                minLength={2}
                maxLength={100}
                placeholder="내 빌드 이름"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              공개 범위
              <select
                name="visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as BuildVisibility)}
              >
                {Object.entries(visibilityLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {key === "PRIVATE" ? label : `${label} · 승인 요청`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <div className="gear-workbench">
          <aside className="gear-context-panel gear-panel">
            <div className="gear-panel-heading">
              <Crosshair size={16} />
              <h3>플레이 조건</h3>
            </div>
            <div className="gear-condition-fields">
              <label>
                시나리오
                <select
                  value={draft.context.scenarioKey ?? ""}
                  onChange={(event) =>
                    updateContext(
                      "scenarioKey",
                      (event.target.value || null) as PlannerContext["scenarioKey"],
                    )
                  }
                >
                  <option value="">선택 안 함</option>
                  {Object.entries(scenarioLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                플레이 모드
                <select
                  value={draft.context.mode ?? ""}
                  onChange={(event) =>
                    updateContext("mode", (event.target.value || null) as PlannerContext["mode"])
                  }
                >
                  <option value="">미기록</option>
                  <option value="PVE">PVE</option>
                  <option value="PVP">PVP</option>
                </select>
              </label>
              <label>
                플랫폼
                <select
                  value={draft.context.platform ?? ""}
                  onChange={(event) =>
                    updateContext(
                      "platform",
                      (event.target.value || null) as PlannerContext["platform"],
                    )
                  }
                >
                  <option value="">미기록</option>
                  <option value="PC">PC</option>
                  <option value="MOBILE">모바일</option>
                </select>
              </label>
              <label>
                게임 버전
                <input
                  maxLength={120}
                  value={draft.context.gamePatch ?? ""}
                  onChange={(event) => updateContext("gamePatch", event.target.value || null)}
                  placeholder="직접 입력"
                />
              </label>
              <label>
                클래스
                <input
                  maxLength={120}
                  value={draft.context.characterClass ?? ""}
                  onChange={(event) => updateContext("characterClass", event.target.value || null)}
                  placeholder="직접 입력"
                />
              </label>
            </div>
            <div className="gear-loadout-summary">
              <span>장비 선택</span>
              <strong>
                {equipmentCount}
                <small> / 9</small>
              </strong>
              <p>
                실제 능력치는 게임에서 확인해주세요. 이곳에서는 선택한 장비와 기록을 저장합니다.
              </p>
            </div>
            {armorSets.length > 0 && (
              <div className="gear-armor-set-summary" aria-label="선택한 방어구 세트 구성">
                <span>세트 구성</span>
                <ul>
                  {armorSets.map(({ setId, count }) => (
                    <li key={setId}>
                      {armorSetLabels[setId] ?? "이름 미확인 세트"} · {count}부위
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="gear-key-summary" aria-label="핵심 방어구 구성">
              <span>핵심 방어구</span>
              <strong>{keyArmors.length} / 1</strong>
              {keyArmors.map((selection) => (
                <p key={selection.slot}>
                  {gearSlotLabels[selection.slot]} ·{" "}
                  {gearDisplayName(selection.itemId, draft.catalogNames)}
                </p>
              ))}
              {keyArmors.length > 1 && (
                <p className="gear-error" role="alert">
                  핵심 방어구는 1개만 장착할 수 있습니다. 추가 장비를 변경하거나 해제한 후
                  저장해주세요.
                </p>
              )}
            </div>
          </aside>
          <section className="gear-equipment-panel">
            <div className="gear-panel-heading">
              <Shield size={16} />
              <h3>장비</h3>
              <span>빈 칸은 선택 · 장착된 칸은 상세 설정</span>
            </div>
            <div className="gear-weapons">{weaponSlots.map(renderSlot)}</div>
            <div className="gear-armor">{armorSlots.map(renderSlot)}</div>
            <GearArmorSetEffects sets={armorSets} />
            <div className="gear-support-row">
              <div>
                <div className="gear-panel-heading">
                  <Sparkles size={16} />
                  <h3>전투 감염물</h3>
                </div>
                {renderSlot("combatDeviant")}
              </div>
              <div className="gear-cradle-section">
                <div className="gear-panel-heading">
                  <Layers size={16} />
                  <h3>크래들</h3>
                </div>
                <div className="gear-cradle-grid">{cradleSlots.map(renderSlot)}</div>
                <p className="gear-cradle-note">
                  표시된 8칸은 구성 기록용입니다. {cradleCompatibilityNote}
                </p>
              </div>
            </div>
          </section>
          <aside
            className={`gear-detail-panel gear-panel${focusedSlot === "combatDeviant" ? " gear-deviant-panel" : ""}`}
          >
            {choiceMessage && (
              <p className="gear-error" role="alert">
                {choiceMessage}
              </p>
            )}
            <div className="gear-panel-heading">
              <h3>{gearSlotLabels[focusedSlot]}</h3>
              {focused && (
                <button
                  type="button"
                  className="gear-remove-button"
                  onClick={() => removeSlot(focusedSlot)}
                  aria-label={`${gearSlotLabels[focusedSlot]} 해제`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            {focused && focusedItem ? (
              <>
                <GearItemInfo item={focusedDisplayItem!} scenario={draft.context.scenarioKey} />
                <button
                  type="button"
                  className="button button-quiet gear-change-item"
                  onClick={() => onOpen(focusedSlot)}
                >
                  장비 변경
                </button>
                <div className="gear-instance-fields">
                  {(weaponSlots.includes(focusedSlot) || armorSlots.includes(focusedSlot)) &&
                    numberField(focused, "level", "장비 레벨")}
                  {focusedSlot === "combatDeviant" && (
                    <>
                      {numberField(focused, "abilityGrade", "어빌리티 등급")}
                      {numberField(focused, "activityGrade", "활성 등급")}
                    </>
                  )}
                </div>
                {focusedSlot === "combatDeviant" && (
                  <div className="gear-deviant-traits">
                    <h4>특성</h4>
                    {focusedItem.allowedTraitIds.length || focused.traitIds.length ? (
                      <GearTraitSelector
                        allowedIds={focusedItem.allowedTraitIds}
                        selectedIds={focused.traitIds}
                        recordedNames={draft.catalogNames}
                        onChange={(traitIds) =>
                          updateSlot(focusedSlot, (current) => ({ ...current, traitIds }))
                        }
                      />
                    ) : (
                      <p className="gear-muted">선택 가능한 특성은 확인 중입니다.</p>
                    )}
                    <GearDeviantFusionGuide
                      key={focused.itemId}
                      selection={focused}
                      recordedNames={draft.catalogNames}
                      scenario={draft.context.scenarioKey}
                    />
                  </div>
                )}
                {(weaponSlots.includes(focusedSlot) || armorSlots.includes(focusedSlot)) && (
                  <>
                    <div className="gear-detail-tabs" role="tablist" aria-label="장비 설정">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={detailTab === "module"}
                        aria-controls="gear-module-panel"
                        id="gear-module-tab"
                        tabIndex={detailTab === "module" ? 0 : -1}
                        onKeyDown={handleDetailTabKey}
                        onClick={() => setDetailTab("module")}
                      >
                        모듈
                      </button>
                      {weaponSlots.includes(focusedSlot) && focusedSlot !== "melee" && (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={detailTab === "accessories"}
                          aria-controls="gear-accessory-panel"
                          id="gear-accessory-tab"
                          tabIndex={detailTab === "accessories" ? 0 : -1}
                          onKeyDown={handleDetailTabKey}
                          onClick={() => setDetailTab("accessories")}
                        >
                          부속품
                        </button>
                      )}
                    </div>
                    {detailTab === "module" ? (
                      <section
                        id="gear-module-panel"
                        role="tabpanel"
                        aria-labelledby="gear-module-tab"
                      >
                        <button
                          type="button"
                          className="gear-attachment-row"
                          onClick={() => openAttachment(focusedSlot, "module")}
                        >
                          <GearIcon item={focusedModule} />
                          <span>
                            <strong>
                              {draft.catalogNames?.[focused.attachments.module ?? ""] ??
                                focusedModule?.name ??
                                (focused.attachments.module ? "이전 모듈" : "모듈 선택")}
                            </strong>
                            <small>
                              {focusedModule?.moduleGeneration === "NEW" ||
                              !focused.attachments.module
                                ? "신규 모듈"
                                : "이전 모듈 기록"}
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                        {focused.attachments.module && !focusedModule && (
                          <button
                            type="button"
                            className="gear-text-button"
                            onClick={() => {
                              updateSlot(focusedSlot, (current) =>
                                changeGearAttachment(current, "module", null),
                              );
                              const key = `${focusedSlot}.moduleLevel`;
                              setNumberTexts((previous) => ({ ...previous, [key]: "" }));
                              setNumberErrors((previous) => ({ ...previous, [key]: "" }));
                            }}
                          >
                            이전 모듈 해제
                          </button>
                        )}
                        {focusedModule && (
                          <>
                            {focusedModule.moduleSuffixId ? (
                              <p className="gear-module-selection-note">
                                {focusedModule.moduleShiny ? "섬광" : "일반"} ·{" "}
                                {gearItemById.get(focusedModule.moduleSuffixId)?.name ??
                                  "선택한 계열"}
                              </p>
                            ) : (
                              <label className="gear-module-suffix">
                                모듈 접미사
                                <select
                                  value={focused.attachments.moduleSuffix ?? ""}
                                  onChange={(event) =>
                                    updateSlot(focusedSlot, (current) => ({
                                      ...current,
                                      attachments: {
                                        ...current.attachments,
                                        moduleSuffix: event.target.value || null,
                                      },
                                    }))
                                  }
                                >
                                  <option value="">미선택</option>
                                  {focused.attachments.moduleSuffix &&
                                    !focusedModule.allowedSuffixIds.includes(
                                      focused.attachments.moduleSuffix,
                                    ) && (
                                      <option value={focused.attachments.moduleSuffix} disabled>
                                        {draft.catalogNames?.[focused.attachments.moduleSuffix] ??
                                          "이전 접미사"}
                                      </option>
                                    )}
                                  {focusedModule.allowedSuffixIds.map((id) => (
                                    <option key={id} value={id}>
                                      {gearItemById.get(id)?.name ?? "이전 접미사"}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <p className="gear-muted gear-module-selection-note">
                              모듈 이름과 아이콘을 확인해 장착하세요. 게임에서는 보유한 최고 레벨이
                              적용됩니다.
                            </p>
                            <button
                              type="button"
                              className="gear-text-button"
                              onClick={() => {
                                updateSlot(focusedSlot, (current) =>
                                  changeGearAttachment(current, "module", null),
                                );
                                const key = `${focusedSlot}.moduleLevel`;
                                setNumberTexts((previous) => ({ ...previous, [key]: "" }));
                                setNumberErrors((previous) => ({ ...previous, [key]: "" }));
                              }}
                            >
                              모듈 해제
                            </button>
                          </>
                        )}
                      </section>
                    ) : (
                      <section
                        id="gear-accessory-panel"
                        role="tabpanel"
                        aria-labelledby="gear-accessory-tab"
                      >
                        {(
                          ["muzzle", "sight", "tactical", "magazine", "ammo"] as AttachmentKey[]
                        ).map((key) => {
                          const id = focused.attachments[key];
                          const item = id ? gearItemById.get(id) : undefined;
                          return (
                            <div className="gear-attachment-container" key={key}>
                              <button
                                type="button"
                                className="gear-attachment-row"
                                onClick={() => openAttachment(focusedSlot, key)}
                              >
                                <GearIcon
                                  item={item}
                                  fallbackIcon={!id ? `/game/planner/ui/tab-${key}.png` : undefined}
                                />
                                <span>
                                  <small>{attachmentLabels[key]}</small>
                                  <strong>
                                    {(id && draft.catalogNames?.[id]) ??
                                      item?.name ??
                                      (id ? "이전 부속품" : "선택")}
                                  </strong>
                                </span>
                                <ChevronRight size={16} />
                              </button>
                              {id && (
                                <button
                                  type="button"
                                  className="gear-text-button"
                                  onClick={() =>
                                    updateSlot(focusedSlot, (current) =>
                                      changeGearAttachment(current, key, null),
                                    )
                                  }
                                >
                                  {attachmentLabels[key]} 해제
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </section>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="gear-detail-empty">
                <Shield size={38} />
                {focused && (
                  <strong>{draft.catalogNames?.[focused.itemId] ?? "이전 장비 기록"}</strong>
                )}
                <p>
                  슬롯에서 장비를 선택하면
                  <br />
                  상세 정보가 표시됩니다.
                </p>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => onOpen(focusedSlot)}
                >
                  아이템 선택
                </button>
                {focused && (
                  <p className="gear-muted">이전 장비 기록은 선택을 변경하기 전까지 유지됩니다.</p>
                )}
              </div>
            )}
          </aside>
        </div>
        <GearConsumablesEditor
          value={draft.consumables}
          characterClass={draft.context.characterClass}
          disabled={!ready || pending || state.ok}
          onClassChange={(value) => updateContext("characterClass", value)}
          onChange={(consumables) => setDraft((previous) => ({ ...previous, consumables }))}
        />
        <section className="gear-recommendation gear-panel">
          <div className="gear-panel-heading">
            <Star size={16} />
            <h3>빌드 추천</h3>
            <span>장비 등급과 별개로 남기는 추천 기록</span>
          </div>
          <div className="gear-recommendation-grid">
            <div>
              <span className="gear-field-caption">추천 점수</span>
              <div className="gear-rating" role="group" aria-label="빌드 추천 점수">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    type="button"
                    key={rating}
                    aria-label={`추천 ${rating}점`}
                    aria-pressed={draft.recommendation.rating === rating}
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        recommendation: { ...previous.recommendation, rating },
                      }))
                    }
                  >
                    <Star
                      size={27}
                      fill={(draft.recommendation.rating ?? 0) >= rating ? "currentColor" : "none"}
                    />
                  </button>
                ))}
                <button
                  type="button"
                  className="gear-rating-clear"
                  onClick={() =>
                    setDraft((previous) => ({
                      ...previous,
                      recommendation: { ...previous.recommendation, rating: null },
                    }))
                  }
                >
                  미평가
                </button>
              </div>
              <label>
                추천 메모
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={draft.recommendation.notes}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      recommendation: { ...previous.recommendation, notes: event.target.value },
                    }))
                  }
                  placeholder="이 빌드가 잘 맞는 상황을 기록해주세요."
                />
              </label>
            </div>
            <TagSelector
              label="콘텐츠"
              options={contentChoices}
              values={draft.recommendation.contents}
              maximum={16}
              onChange={(contents) =>
                setDraft((previous) => ({
                  ...previous,
                  recommendation: { ...previous.recommendation, contents },
                }))
              }
            />
            <TagSelector
              label="태그"
              options={tagChoices}
              values={draft.recommendation.tags}
              maximum={24}
              onChange={(tags) =>
                setDraft((previous) => ({
                  ...previous,
                  recommendation: { ...previous.recommendation, tags },
                }))
              }
            />
          </div>
        </section>
        <section className="gear-build-notes gear-panel">
          <h3>빌드 설명</h3>
          <ContentEditor
            textName="description"
            initialDocument={initial?.selectedVersion.bodyDocument ?? null}
            initialText={description}
            maxTextLength={5000}
            onChange={(_document, text) => setDescription(text)}
            onReadyChange={setMediaReady}
            disabled={pending || state.ok || preview}
          />
          <YouTubeField
            initialUrl={initial?.selectedVersion.youtubeUrl ?? null}
            disabled={pending || state.ok || preview}
          />
        </section>
        <details className="gear-build-notes gear-panel">
          <summary>버전과 장비 구성 메모</summary>
          <div className="gear-notes-grid">
            <label>
              이번 버전 메모
              <textarea
                name="notes"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <label>
              장비 구성 메모
              <textarea
                rows={3}
                maxLength={2000}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, notes: event.target.value }))
                }
              />
            </label>
          </div>
        </details>
        <div className="gear-save-bar">
          <p>
            {preview
              ? "미리보기입니다. 저장하려면 승인된 Discord 계정으로 로그인해주세요."
              : baseBuildId
                ? `v${baseSourceVersion}을 바탕으로 새 버전을 저장합니다. 기존 기록은 유지됩니다.`
                : "게임에서 따라 장착할 수 있는 나의 구성을 저장합니다."}
            <small>
              하이브 공유와 전체 공개는 관리자 승인 후 적용됩니다. 승인 전에는 기존 공유 버전이
              유지됩니다.
            </small>
          </p>
          <button
            type="submit"
            className="button button-primary"
            disabled={
              preview ||
              pending ||
              state.ok ||
              !mediaReady ||
              !title.trim() ||
              Boolean(numericError) ||
              Boolean(traitError) ||
              Boolean(consumableError) ||
              keyArmors.length > 1
            }
          >
            {state.ok
              ? "저장 완료"
              : pending
                ? "저장 중…"
                : baseBuildId
                  ? "새 버전으로 저장"
                  : "빌드 저장"}
          </button>
        </div>
      </fieldset>
      {(traitError || numericError || consumableError || state.message) && (
        <p
          className={`planner-form-message ${state.ok ? "" : "is-error"}`}
          role={state.ok ? "status" : "alert"}
        >
          {traitError || numericError || consumableError || state.message}
        </p>
      )}
      {picker && !pending && !state.ok && (
        <GearCatalogPicker
          key={`${picker.slot}.${picker.attachment ?? "item"}`}
          title={`${gearSlotLabels[picker.slot]}${picker.attachment ? ` · ${attachmentLabels[picker.attachment]}` : ""} 선택`}
          items={pickerItems}
          scenario={draft.context.scenarioKey}
          disabledReasons={disabledReasons}
          selectedId={
            picker.attachment
              ? selectedBySlot.get(picker.slot)?.attachments[picker.attachment]
              : selectedBySlot.get(picker.slot)?.itemId
          }
          onChoose={choose}
          onClose={() => setPicker(null)}
          returnFocus={returnFocus}
          fallbackFocusId={`gear-slot-${picker.slot}`}
          notice={picker.slot.startsWith("cradle-") ? cradleCompatibilityNote : undefined}
        />
      )}
    </form>
  );
}
