"use client";

import type { PlannerBuildDetail } from "@/lib/data/build-planner-types";
import { LegacyPlannerEditor } from "./legacy-editor";
import { GearPlannerEditor } from "./gear-editor";
import { useUserPreferences } from "@/components/user-preferences-provider";

export function BuildPlannerEditor(props: { initial?: PlannerBuildDetail; preview?: boolean }) {
  const { userKey } = useUserPreferences();
  const version = props.initial?.selectedVersion;
  const key = `${userKey}:${props.initial?.id ?? "new"}:${version?.version ?? 0}`;
  if (version && version.loadout?.schemaVersion !== "uniz-gear.v2")
    return <LegacyPlannerEditor key={key} {...props} />;
  return <GearPlannerEditor key={key} {...props} />;
}

export const PlannerEditor = BuildPlannerEditor;
