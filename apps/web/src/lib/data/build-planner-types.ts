import type { PlannerLoadout, PlannerGearLoadout } from "@uniz/build-engine";
import type { ContentDocument } from "../content-document";
import type { BuildSharingState } from "../server/build-sharing";

export type BuildVisibility = "PRIVATE" | "HIVE" | "PUBLIC";

export interface PlannerBuildSummary {
  id: string;
  title: string;
  description: string;
  visibility: BuildVisibility;
  owner: { id: string; name: string; handle: string | null };
  latestVersion: number;
  updatedAt: string;
  createdAt: string;
  isOwner: boolean;
  archivedAt: string | null;
  sharing?: BuildSharingState;
  recommendationScore?: number | null;
  recommendationNote?: string;
  publishedVersion?: number;
}

export interface PlannerVersionSummary {
  id: string;
  version: number;
  createdAt: string;
  notes: string;
}

export interface PlannerBuildDetail extends PlannerBuildSummary {
  versions: PlannerVersionSummary[];
  selectedVersion: PlannerVersionSummary & {
    schemaVersion: string;
    loadout: PlannerLoadout | PlannerGearLoadout | null;
    bodyDocument?: ContentDocument | null;
    youtubeUrl?: string | null;
    approvedVisibility?: "HIVE" | "PUBLIC" | null;
  };
  mayEdit: boolean;
  versionsNext?: number | null;
  likeCount?: number;
  likedByMe?: boolean;
  canLike?: boolean;
}

export interface PlannerBuildLibrary {
  owned: PlannerBuildSummary[];
  hive: PlannerBuildSummary[];
  public: PlannerBuildSummary[];
  nextCursors?: { owned: string | null; hive: string | null; public: string | null };
}

export interface PlannerLibraryOptions {
  query?: string;
  archived?: boolean;
  ownedCursor?: string;
  hiveCursor?: string;
  publicCursor?: string;
}

export interface PlannerActionState {
  ok: boolean;
  message: string;
  href?: string;
  version?: number;
}
