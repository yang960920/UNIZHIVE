import { z } from "zod";

export const CONTENT_SCHEMA_VERSION = "uniz-content.v1" as const;
export const CONTENT_MAX_IMAGES = 10;
export const CONTENT_MAX_TEXT = 20_000;
export const CONTENT_MAX_BYTES = 256 * 1024;
export type ContentMark = { type: "bold" | "italic" | "strike" | "code" };
export type ContentInline =
  { type: "text"; text: string; marks?: ContentMark[] } | { type: "hardBreak" };
export type ContentBlock =
  | { type: "paragraph"; content?: ContentInline[] }
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: ContentInline[] }
  | { type: "image"; attrs: { imageId: string; alt: string } }
  | { type: "blockquote"; content: ContentBlock[] }
  | { type: "bulletList"; content: ContentListItem[] }
  | { type: "orderedList"; attrs: { start: number }; content: ContentListItem[] };
export type ContentListItem = { type: "listItem"; content: ContentBlock[] };
export interface ContentDocument {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  type: "doc";
  content: ContentBlock[];
}

const inlineSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      text: z.string().min(1).max(CONTENT_MAX_TEXT),
      marks: z
        .array(z.object({ type: z.enum(["bold", "italic", "strike", "code"]) }).strict())
        .max(4)
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal("hardBreak") }).strict(),
]);
const listItemSchema: z.ZodType<ContentListItem> = z.lazy(() =>
  z.object({ type: z.literal("listItem"), content: z.array(blockSchema).min(1).max(200) }).strict(),
);
const blockSchema: z.ZodType<ContentBlock> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({ type: z.literal("paragraph"), content: z.array(inlineSchema).max(2000).optional() })
      .strict(),
    z
      .object({
        type: z.literal("heading"),
        attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
        content: z.array(inlineSchema).max(2000).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("image"),
        attrs: z.object({ imageId: z.uuid(), alt: z.string().max(300) }).strict(),
      })
      .strict(),
    z
      .object({ type: z.literal("blockquote"), content: z.array(blockSchema).min(1).max(200) })
      .strict(),
    z
      .object({ type: z.literal("bulletList"), content: z.array(listItemSchema).min(1).max(200) })
      .strict(),
    z
      .object({
        type: z.literal("orderedList"),
        attrs: z.object({ start: z.number().int().min(1).max(9999) }).strict(),
        content: z.array(listItemSchema).min(1).max(200),
      })
      .strict(),
  ]),
);

function walk(blocks: readonly ContentBlock[], visit: (block: ContentBlock) => void) {
  for (const block of blocks) {
    visit(block);
    if (block.type === "blockquote") walk(block.content, visit);
    else if (block.type === "bulletList" || block.type === "orderedList")
      for (const item of block.content) walk(item.content, visit);
  }
}
export function contentImageIds(document: ContentDocument | null): string[] {
  const ids: string[] = [];
  if (document)
    walk(document.content, (block) => {
      if (block.type === "image") ids.push(block.attrs.imageId);
    });
  return [...new Set(ids)];
}
export function contentImagePreview(document: ContentDocument | null): {
  coverImage: { url: string; alt: string } | null;
  imageCount: number;
} {
  let coverImage: { url: string; alt: string } | null = null;
  const ids = new Set<string>();
  if (document)
    walk(document.content, (block) => {
      if (block.type !== "image") return;
      coverImage ??= { url: contentImageUrl(block.attrs.imageId), alt: block.attrs.alt };
      ids.add(block.attrs.imageId);
    });
  return { coverImage, imageCount: ids.size };
}
export function contentPlainText(document: ContentDocument | null): string {
  const lines: string[] = [];
  if (document)
    walk(document.content, (block) => {
      if (block.type === "paragraph" || block.type === "heading")
        lines.push(
          (block.content ?? []).map((part) => (part.type === "text" ? part.text : "\n")).join(""),
        );
      else if (block.type === "image") lines.push(block.attrs.alt || "[이미지]");
    });
  return lines.join("\n\n").trim();
}

/** Display prose without adding image descriptions from the stored search mirror. */
export function contentExcerptText(document: ContentDocument | null): string {
  const lines: string[] = [];
  if (document)
    walk(document.content, (block) => {
      if (block.type === "paragraph" || block.type === "heading")
        lines.push(
          (block.content ?? []).map((part) => (part.type === "text" ? part.text : "\n")).join(""),
        );
    });
  return lines.join("\n\n").trim();
}

/** Reject oversized/deep input before entering a recursive validator. */
function assertBounded(value: unknown) {
  const serialized = JSON.stringify(value);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > CONTENT_MAX_BYTES)
    throw new Error("본문이 너무 큽니다. 내용을 줄여 주세요.");
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++count > 10_000 || entry.depth > 24) throw new Error("본문 구조가 너무 복잡합니다.");
    if (entry.value && typeof entry.value === "object")
      for (const child of Object.values(entry.value))
        pending.push({ value: child, depth: entry.depth + 1 });
  }
}
const documentObjectSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    type: z.literal("doc"),
    content: z.array(blockSchema).max(1000),
  })
  .strict()
  .superRefine((document, context) => {
    if (contentPlainText(document).length > CONTENT_MAX_TEXT)
      context.addIssue({ code: "custom", message: "본문은 20,000자 이내로 입력해 주세요." });
    let imageCount = 0;
    walk(document.content, (block) => {
      if (block.type === "image") imageCount++;
    });
    if (imageCount > CONTENT_MAX_IMAGES)
      context.addIssue({ code: "custom", message: "이미지는 최대 10개까지 넣을 수 있습니다." });
  });
export const contentDocumentSchema = z.preprocess((value, context) => {
  try {
    assertBounded(value);
    return value;
  } catch (cause) {
    context.addIssue({
      code: "custom",
      message: cause instanceof Error ? cause.message : "본문 구조를 확인해 주세요.",
    });
    return z.NEVER;
  }
}, documentObjectSchema);
export function parseContentDocument(value: unknown): ContentDocument | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).byteLength > CONTENT_MAX_BYTES)
      throw new Error("본문이 너무 큽니다.");
    value = JSON.parse(value);
  }
  assertBounded(value);
  return contentDocumentSchema.parse(value);
}
export function contentImageUrl(id: string): string {
  return `/api/content/image/${encodeURIComponent(z.uuid().parse(id))}`;
}
export function contentEditorJson(document: ContentDocument | null, text: string) {
  function nodes(blocks: ContentBlock[]): unknown[] {
    return blocks.map((block) =>
      block.type === "image"
        ? {
            ...block,
            attrs: {
              ...block.attrs,
              src: contentImageUrl(block.attrs.imageId),
              title: null,
              uploadId: null,
            },
          }
        : block.type === "blockquote"
          ? { ...block, content: nodes(block.content) }
          : block.type === "bulletList" || block.type === "orderedList"
            ? {
                ...block,
                content: block.content.map((item) => ({ ...item, content: nodes(item.content) })),
              }
            : block,
    );
  }
  return document
    ? { type: "doc", content: nodes(document.content) }
    : {
        type: "doc",
        content: [
          {
            type: "paragraph",
            ...(text ? { content: [{ type: "text", text: text.replace(/\r\n/g, "\n") }] } : {}),
          },
        ],
      };
}
/** Editor-only attributes and unfinished upload placeholders never enter persisted documents. */
export function contentDocumentFromEditor(value: unknown): ContentDocument {
  function nodes(input: unknown[]): unknown[] {
    return input.flatMap((node) => {
      if (!node || typeof node !== "object") return [];
      const item = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };
      if (item.type === "image")
        return typeof item.attrs?.imageId === "string"
          ? [
              {
                type: "image",
                attrs: {
                  imageId: item.attrs.imageId,
                  alt: typeof item.attrs.alt === "string" ? item.attrs.alt : "",
                },
              },
            ]
          : [];
      if (item.type === "orderedList")
        return [
          {
            type: item.type,
            attrs: { start: item.attrs?.start ?? 1 },
            content: nodes(item.content ?? []),
          },
        ];
      if (item.type === "heading")
        return [
          {
            type: item.type,
            attrs: { level: item.attrs?.level },
            ...(item.content ? { content: item.content } : {}),
          },
        ];
      if (item.type === "blockquote" || item.type === "bulletList" || item.type === "listItem")
        return [{ type: item.type, content: nodes(item.content ?? []) }];
      return [node];
    });
  }
  const input = value as { content?: unknown[] };
  return parseContentDocument({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    type: "doc",
    content: nodes(input.content ?? []),
  })!;
}

export function parseYouTubeUrl(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string" || input.length > 1000)
    throw new Error("유튜브 영상 링크를 확인해 주세요.");
  const value = input.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("유튜브 영상 링크를 확인해 주세요.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("https 유튜브 영상 링크를 입력해 주세요.");
  let id: string | null = null;
  if (["youtu.be", "www.youtu.be"].includes(url.hostname))
    id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1] ?? null;
  else if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ].includes(url.hostname)
  )
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/)?.[1] ?? null);
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error("유튜브 영상 한 개의 링크를 입력해 주세요.");
  const time = url.searchParams.get("start") ?? url.searchParams.get("t");
  let seconds = 0;
  if (time) {
    if (/^\d+$/.test(time)) seconds = Number(time);
    else {
      const match = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
      if (!match || !match[0]) throw new Error("유튜브 시작 시간을 확인해 주세요.");
      seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    }
    if (!Number.isSafeInteger(seconds) || seconds > 86400)
      throw new Error("유튜브 시작 시간을 확인해 주세요.");
  }
  return `https://www.youtube.com/watch?v=${id}${seconds ? `&t=${seconds}s` : ""}`;
}
