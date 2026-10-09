import { describe, expect, it } from "vitest";
import {
  CONTENT_SCHEMA_VERSION,
  contentDocumentFromEditor,
  contentDocumentSchema,
  contentEditorJson,
  contentExcerptText,
  contentImageIds,
  contentImagePreview,
  contentPlainText,
  parseContentDocument,
  parseYouTubeUrl,
  type ContentDocument,
} from "../src/lib/content-document";
const imageId = "bf93c9f3-367e-4d2e-a8b2-d576aa867da1";
const document = (content: ContentDocument["content"]): ContentDocument => ({
  schemaVersion: CONTENT_SCHEMA_VERSION,
  type: "doc",
  content,
});

describe("stored article documents", () => {
  it("validates ordered text, formatting and image identities while retaining a searchable text mirror", () => {
    const value = document([
      {
        type: "paragraph",
        content: [{ type: "text", text: "공략 앞부분", marks: [{ type: "bold" }] }],
      },
      { type: "image", attrs: { imageId, alt: "보스 입구" } },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "준비물" },
                  { type: "hardBreak" },
                  { type: "text", text: "탄약" },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(parseContentDocument(JSON.stringify(value))).toEqual(value);
    expect(contentImageIds(value)).toEqual([imageId]);
    expect(contentPlainText(value)).toBe("공략 앞부분\n\n보스 입구\n\n준비물\n탄약");
  });
  it.each([null, undefined, ""])("keeps a legacy missing document as null", (value) =>
    expect(parseContentDocument(value)).toBeNull(),
  );
  it("extracts actual prose for excerpts without removing literal text that resembles an image marker", () => {
    const value = parseContentDocument(
      document([
        { type: "image", attrs: { imageId, alt: "표지 설명" } },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "집 구경" }] },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "문단 설명" },
                { type: "hardBreak" },
                { type: "text", text: "[이미지]라는 단어" },
              ],
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "테라스 소개" }] }],
            },
          ],
        },
      ]),
    );
    expect(contentExcerptText(value)).toBe(
      "집 구경\n\n문단 설명\n[이미지]라는 단어\n\n테라스 소개",
    );
    expect(contentPlainText(value)).toContain("표지 설명");
  });
  it("keeps an image-only excerpt empty while preserving the searchable stored image descriptions", () => {
    const value = parseContentDocument(
      document([
        { type: "paragraph", content: [] },
        { type: "image", attrs: { imageId, alt: "" } },
        { type: "image", attrs: { imageId, alt: "방문 사진" } },
      ]),
    );
    expect(contentExcerptText(value)).toBe("");
    expect(contentExcerptText(null)).toBe("");
    expect(contentPlainText(value)).toBe("[이미지]\n\n방문 사진");
    expect(contentImageIds(value)).toEqual([imageId]);
  });
  it("preserves legacy single and double line breaks when opening the rich editor", () => {
    const text = "첫 줄\n다음 줄\n\n새 문단";
    expect(contentPlainText(contentDocumentFromEditor(contentEditorJson(null, text)))).toBe(text);
  });
  it("extracts one reference for repeated appearances of the same owned image", () => {
    expect(
      contentImageIds(
        document([
          { type: "image", attrs: { imageId, alt: "" } },
          { type: "image", attrs: { imageId, alt: "재사용" } },
        ]),
      ),
    ).toEqual([imageId]);
  });
  it("previews the first photo in document order, including nested photos, and counts unique images", () => {
    const secondId = "79d40ba0-6866-4a46-9989-3263a19e921d";
    expect(
      contentImagePreview(
        document([
          { type: "paragraph", content: [{ type: "text", text: "우리의 집" }] },
          { type: "blockquote", content: [{ type: "image", attrs: { imageId, alt: "테라스" } }] },
          { type: "image", attrs: { imageId: secondId, alt: "거실" } },
          { type: "image", attrs: { imageId, alt: "다시 테라스" } },
        ]),
      ),
    ).toEqual({
      coverImage: { url: `/api/content/image/${imageId}`, alt: "테라스" },
      imageCount: 2,
    });
    expect(contentImagePreview(null)).toEqual({ coverImage: null, imageCount: 0 });
    expect(contentImagePreview(document([{ type: "paragraph", content: [] }]))).toEqual({
      coverImage: null,
      imageCount: 0,
    });
  });
  it.each([
    { type: "script", content: "alert(1)" },
    { type: "image", attrs: { imageId, alt: "", src: "https://untrusted.example/image" } },
    { type: "image", attrs: { imageId, alt: "", ownerId: "someone-else" } },
    { type: "image", attrs: { imageId: "data:image/png;base64,unsafe", alt: "" } },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "link",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    },
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "unsupported" }] },
  ])("rejects unsupported nodes and private or executable attributes", (node) => {
    expect(() =>
      parseContentDocument({ schemaVersion: CONTENT_SCHEMA_VERSION, type: "doc", content: [node] }),
    ).toThrow();
  });
  it("never serializes object URLs, unfinished uploads, DOM src or image dimensions", () => {
    const value = contentDocumentFromEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "유지할 문장" }] },
        {
          type: "image",
          attrs: { src: "blob:preview", uploadId: "pending", imageId: null, alt: "" },
        },
        {
          type: "image",
          attrs: {
            imageId,
            src: "https://arbitrary.example",
            width: 123,
            height: 456,
            alt: "설명",
          },
        },
      ],
    });
    expect(value.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "유지할 문장" }] },
      { type: "image", attrs: { imageId, alt: "설명" } },
    ]);
    expect(JSON.stringify(value)).not.toMatch(/blob:|https:|uploadId|width|height/);
  });
  it("rejects text above 20,000 characters and more than ten displayed images", () => {
    expect(() =>
      parseContentDocument(
        document([{ type: "paragraph", content: [{ type: "text", text: "x".repeat(20_001) }] }]),
      ),
    ).toThrow();
    expect(() =>
      parseContentDocument(
        document(
          Array.from({ length: 11 }, () => ({
            type: "image" as const,
            attrs: { imageId, alt: "" },
          })),
        ),
      ),
    ).toThrow();
  });
  it("rejects deep or cyclic input before recursive schema parsing", () => {
    let nested: unknown = { type: "paragraph", content: [] };
    for (let i = 0; i < 30; i++) nested = { type: "blockquote", content: [nested] };
    expect(
      contentDocumentSchema.safeParse({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        type: "doc",
        content: [nested],
      }).success,
    ).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(contentDocumentSchema.safeParse(cyclic).success).toBe(false);
  });
});
describe("optional canonical YouTube references", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&t=1m20s",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=80s",
    ],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    [
      "https://www.youtube.com/live/dQw4w9WgXcQ?start=30",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
    ],
  ])("normalizes %s without fetching arbitrary external metadata", (url, expected) =>
    expect(parseYouTubeUrl(url)).toBe(expected),
  );
  it.each([null, undefined, "", "   "])("permits no video reference", (url) =>
    expect(parseYouTubeUrl(url)).toBeNull(),
  );
  it.each([
    "javascript:alert(1)",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=123",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "http://youtu.be/dQw4w9WgXcQ",
    "https://user:password@youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=99999999",
  ])("rejects non-video or unsafe links: %s", (url) =>
    expect(() => parseYouTubeUrl(url)).toThrow(),
  );
});
