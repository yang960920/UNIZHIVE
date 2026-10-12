import type { JSONContent } from "@tiptap/react";
import { CONTENT_MAX_IMAGES } from "@/lib/content-document";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/image-upload-limits";

export type ContentEditorDraftImage = {
  key: string;
  imageId?: string;
  uploadId?: string;
  file: File;
};
export type ContentEditorDraft = {
  json: JSONContent;
  images: ContentEditorDraftImage[];
};

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const nodeTypes = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "image",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
]);

/** Local drafts accept unfinished images and invalid-length prose, without accepting arbitrary editor nodes. */
export function isContentEditorDraft(value: unknown): value is ContentEditorDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ContentEditorDraft>;
  if (!draft.json || draft.json.type !== "doc" || !Array.isArray(draft.images)) return false;
  if (draft.images.length > CONTENT_MAX_IMAGES) return false;
  try {
    if (JSON.stringify(draft.json).length > 1_048_576) return false;
  } catch {
    return false;
  }
  const pending: Array<{ node: JSONContent; depth: number }> = [{ node: draft.json, depth: 0 }];
  let count = 0;
  let imageCount = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (!node || typeof node !== "object" || ++count > 10_000 || depth > 24) return false;
    if (!node.type || !nodeTypes.has(node.type)) return false;
    if (node.type === "text" && typeof node.text !== "string") return false;
    if (
      node.marks &&
      (!Array.isArray(node.marks) ||
        node.marks.length > 4 ||
        node.marks.some(
          (mark) =>
            !mark ||
            typeof mark !== "object" ||
            !["bold", "italic", "strike", "code"].includes(mark.type),
        ))
    )
      return false;
    if (node.type === "image") {
      if (++imageCount > CONTENT_MAX_IMAGES) return false;
      if (!uuid.test(node.attrs?.imageId ?? "") && !uuid.test(node.attrs?.uploadId ?? ""))
        return false;
    }
    if (node.content) {
      if (!Array.isArray(node.content)) return false;
      for (const child of node.content) pending.push({ node: child, depth: depth + 1 });
    }
  }
  const keys = new Set<string>();
  for (const image of draft.images) {
    if (
      !image ||
      typeof image !== "object" ||
      typeof image.key !== "string" ||
      !image.key ||
      image.key.length > 100 ||
      keys.has(image.key)
    )
      return false;
    keys.add(image.key);
    if (typeof File === "undefined" || !(image.file instanceof File)) return false;
    if (
      !image.file.size ||
      image.file.size > IMAGE_UPLOAD_MAX_BYTES ||
      !["image/png", "image/jpeg", "image/webp"].includes(image.file.type)
    )
      return false;
    if (!uuid.test(image.imageId ?? "") && !uuid.test(image.uploadId ?? "")) return false;
  }
  return true;
}

/** Object URLs belong to one page lifetime and must never be needed to restore a draft. */
export function contentDraftJson(json: JSONContent): JSONContent {
  const copy = JSON.parse(JSON.stringify(json)) as JSONContent;
  const pending = [copy];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === "image") {
      node.attrs = {
        imageId: node.attrs?.imageId ?? null,
        uploadId: node.attrs?.uploadId ?? null,
        alt: typeof node.attrs?.alt === "string" ? node.attrs.alt : "",
      };
    }
    pending.push(...(node.content ?? []));
  }
  return copy;
}
