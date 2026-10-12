import type { CommunityEditorData } from "../../lib/server/community-repository";
import { COMMUNITY_CATEGORIES, type CommunityCategory } from "../../lib/community-policy";
import {
  contentEditorJson,
  parseContentDocument,
  type ContentDocument,
} from "../../lib/content-document";
import { isContentEditorDraft, type ContentEditorDraft } from "../content/draft";

export interface CommunityPostDraft {
  schemaVersion: "community-post.v1";
  title: string;
  body: string;
  bodyDocument: ContentDocument | null;
  contentDraft: ContentEditorDraft;
  youtubeUrl: string;
  category: CommunityCategory;
  buildVersionId: string;
  isPinned: boolean;
  expectedUpdatedAt: string | null;
}

export function createCommunityPostDraft(
  initial: CommunityEditorData["initial"],
  category: CommunityCategory,
): CommunityPostDraft {
  return {
    schemaVersion: "community-post.v1",
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    bodyDocument: initial?.bodyDocument ?? null,
    contentDraft: {
      json: contentEditorJson(
        initial?.bodyDocument ?? null,
        initial?.body ?? "",
      ) as ContentEditorDraft["json"],
      images: [],
    },
    youtubeUrl: initial?.youtubeUrl ?? "",
    category: initial?.category ?? category,
    buildVersionId: initial?.buildVersionId ?? "",
    isPinned: initial?.isPinned ?? false,
    expectedUpdatedAt: initial?.updatedAt ?? null,
  };
}

/** Drafts may be incomplete or contain an invalid video URL; publication validates them later. */
export function isCommunityPostDraft(value: unknown): value is CommunityPostDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<CommunityPostDraft>;
  if (
    draft.schemaVersion !== "community-post.v1" ||
    typeof draft.title !== "string" ||
    draft.title.length > 160 ||
    typeof draft.body !== "string" ||
    draft.body.length > 100_000 ||
    typeof draft.youtubeUrl !== "string" ||
    draft.youtubeUrl.length > 1000 ||
    !COMMUNITY_CATEGORIES.includes(draft.category as CommunityCategory) ||
    typeof draft.buildVersionId !== "string" ||
    draft.buildVersionId.length > 128 ||
    typeof draft.isPinned !== "boolean" ||
    !("bodyDocument" in draft) ||
    (draft.expectedUpdatedAt !== null &&
      (typeof draft.expectedUpdatedAt !== "string" || draft.expectedUpdatedAt.length > 100)) ||
    !isContentEditorDraft(draft.contentDraft)
  )
    return false;
  try {
    parseContentDocument(draft.bodyDocument);
    return true;
  } catch {
    return false;
  }
}
