"use client";

import type { PlannerBuildDetail } from "@/lib/data/build-planner-types";
import { LegacyPlannerEditor } from "./legacy-editor";
import { GearPlannerEditor } from "./gear-editor";

export function BuildPlannerEditor(props: { initial?: PlannerBuildDetail; preview?: boolean }) {
  const version = props.initial?.selectedVersion;
  if (version && version.loadout?.schemaVersion !== "uniz-gear.v2")
    return <LegacyPlannerEditor {...props} />;
  return <GearPlannerEditor {...props} />;
}

export const PlannerEditor = BuildPlannerEditor;
