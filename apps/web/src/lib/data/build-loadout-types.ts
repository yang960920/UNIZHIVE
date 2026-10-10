import type { LoadoutPreparationResult } from "@uniz/build-engine";

export interface BuildLoadoutSummary {
  id: string;
  title: string;
  notes: string;
  updatedAt: string;
  archivedAt: string | null;
  entryCount: number;
}
export interface LoadoutBuildChoice {
  buildId: string;
  buildVersionId: string;
  version: number;
  title: string;
  archived: boolean;
}
export interface BuildLoadoutDetail extends BuildLoadoutSummary {
  entries: LoadoutBuildChoice[];
  preparation: LoadoutPreparationResult;
  preparationText: string;
  mayEdit: boolean;
  mayRestore: boolean;
}
export interface LoadoutChoicePage {
  items: LoadoutBuildChoice[];
  nextCursor: string | null;
}
export interface LoadoutActionState {
  ok: boolean;
  message: string;
  href?: string;
}
