"use client";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import FileHandler from "@tiptap/extension-file-handler";
import { NodeSelection } from "@tiptap/pm/state";
import { ArrowDown, ArrowUp, Bold, ImagePlus, Italic, List, Trash2 } from "lucide-react";
import { uploadContentImage } from "@/lib/content-media-actions";
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_LIMIT_LABEL } from "@/lib/image-upload-limits";
import {
  CONTENT_MAX_IMAGES,
  contentDocumentFromEditor,
  contentEditorJson,
  contentImageUrl,
  contentPlainText,
  type ContentDocument,
} from "@/lib/content-document";
import "./content.css";

const ContentImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-content-image-id"),
        renderHTML: (attrs) => (attrs.imageId ? { "data-content-image-id": attrs.imageId } : {}),
      },
      uploadId: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-content-image-id]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    let src = "";
    try {
      if (node.attrs.imageId) src = contentImageUrl(node.attrs.imageId);
    } catch {
      /* Invalid pasted references remain unloaded and cannot be saved. */
    }
    if (
      !src &&
      node.attrs.uploadId &&
      typeof node.attrs.src === "string" &&
      node.attrs.src.startsWith("blob:")
    )
      src = node.attrs.src;
    return [
      "img",
      {
        ...HTMLAttributes,
        src,
        ...(node.attrs.uploadId ? { "data-upload-id": node.attrs.uploadId } : {}),
      },
    ];
  },
  addInputRules() {
    return [];
  },
}).configure({ allowBase64: false, inline: false });

type Upload = {
  id: string;
  file: File;
  preview: string;
  state: "PENDING" | "ERROR";
  message: string;
};
function uploadPosition(editor: Editor, id: string): number | null {
  let position: number | null = null;
  editor.state.doc.descendants((node, at) => {
    if (node.type.name === "image" && node.attrs.uploadId === id) position = at;
  });
  return position;
}

export function ContentEditor({
  name = "bodyDocument",
  textName = "body",
  initialDocument = null,
  initialText = "",
  maxTextLength = 20_000,
  onChange,
  onReadyChange,
  disabled = false,
}: {
  name?: string;
  textName?: string;
  initialDocument?: ContentDocument | null;
  initialText?: string;
  maxTextLength?: number;
  onChange?: (document: ContentDocument, text: string) => void;
  onReadyChange?: (ready: boolean) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const jobs = useRef(new Map<string, Upload>());
  const callbacks = useRef({ onChange, onReadyChange, maxTextLength, disabled });
  useEffect(() => {
    callbacks.current = { onChange, onReadyChange, maxTextLength, disabled };
  }, [onChange, onReadyChange, maxTextLength, disabled]);
  const [initial] = useState(() => contentEditorJson(initialDocument, initialText));
  const [document, setDocument] = useState<ContentDocument>(
    () => initialDocument ?? contentDocumentFromEditor(initial),
  );
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [selected, setSelected] = useState<{ position: number; alt: string } | null>(null);
  const syncJobs = () => setUploads([...jobs.current.values()]);

  function publish(editor: Editor) {
    for (const [id, upload] of jobs.current) {
      if (uploadPosition(editor, id) === null) {
        URL.revokeObjectURL(upload.preview);
        jobs.current.delete(id);
      }
    }
    syncJobs();
    try {
      const next = contentDocumentFromEditor(editor.getJSON());
      const text = contentPlainText(next);
      if (text.length > callbacks.current.maxTextLength)
        throw new Error(
          `본문은 ${callbacks.current.maxTextLength.toLocaleString()}자 이내로 입력해 주세요.`,
        );
      setDocument(next);
      setDocumentError("");
      callbacks.current.onChange?.(next, text);
    } catch (cause) {
      setDocumentError(
        cause instanceof Error ? cause.message : "본문의 이미지와 내용을 확인해 주세요.",
      );
    }
    const selection = editor.state.selection;
    setSelected(
      selection instanceof NodeSelection && selection.node.type.name === "image"
        ? { position: selection.from, alt: selection.node.attrs.alt ?? "" }
        : null,
    );
  }
  async function upload(editor: Editor, job: Upload) {
    job.state = "PENDING";
    job.message = "이미지 준비 중…";
    syncJobs();
    const form = new FormData();
    form.set("image", job.file);
    try {
      const result = await uploadContentImage(form);
      if (!result.ok || !result.image) throw new Error(result.message);
      if (editor.isDestroyed || !jobs.current.has(job.id)) return;
      const position = uploadPosition(editor, job.id);
      if (position === null) return;
      const node = editor.state.doc.nodeAt(position)!;
      jobs.current.delete(job.id);
      URL.revokeObjectURL(job.preview);
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(position, undefined, {
          ...node.attrs,
          imageId: result.image.id,
          uploadId: null,
          src: result.image.url,
        }),
      );
      syncJobs();
      publish(editor);
    } catch (cause) {
      if (!jobs.current.has(job.id) || editor.isDestroyed) return;
      job.state = "ERROR";
      job.message = cause instanceof Error ? cause.message : "이미지를 준비하지 못했습니다.";
      syncJobs();
    }
  }
  function insertFiles(editor: Editor, files: File[], position: number) {
    if (callbacks.current.disabled) return;
    setError("");
    let count = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "image") count++;
    });
    if (count + files.length > CONTENT_MAX_IMAGES) {
      setError("이미지는 최대 10개까지 넣을 수 있습니다.");
      return;
    }
    for (const file of files) {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        !file.size ||
        file.size > IMAGE_UPLOAD_MAX_BYTES
      ) {
        setError(`PNG·JPG·WebP, ${IMAGE_UPLOAD_LIMIT_LABEL} 이하의 이미지를 선택해 주세요.`);
        return;
      }
    }
    const created = files.map((file): Upload => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      state: "PENDING",
      message: "이미지 준비 중…",
    }));
    for (const job of created) jobs.current.set(job.id, job);
    editor
      .chain()
      .focus()
      .insertContentAt(
        position,
        created.map((job) => ({
          type: "image",
          attrs: { src: job.preview, uploadId: job.id, imageId: null, alt: "" },
        })),
      )
      .run();
    syncJobs();
    for (const job of created) void upload(editor, job);
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
      ContentImage,
      // FileHandler only stores these callbacks here; refs are read later by drop/paste events.
      // eslint-disable-next-line react-hooks/refs
      FileHandler.configure({
        consumePasteEvent: true,
        onDrop: (target, files, position) => insertFiles(target, files, position),
        onPaste: (target, files) => insertFiles(target, files, target.state.selection.from),
      }),
    ],
    content: initial as JSONContent,
    editable: !disabled,
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-labelledby": labelId },
    },
    onUpdate: ({ editor: target }) => publish(target),
    onSelectionUpdate: ({ editor: target }) => publish(target),
  });
  const ready = Boolean(editor && !disabled && !uploads.length && !documentError);
  useEffect(() => {
    callbacks.current.onReadyChange?.(ready);
  }, [ready]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(
    () => () => {
      for (const job of jobs.current.values()) URL.revokeObjectURL(job.preview);
      jobs.current.clear();
    },
    [],
  );

  function choose(event: ChangeEvent<HTMLInputElement>) {
    if (editor && event.target.files?.length)
      insertFiles(editor, Array.from(event.target.files), editor.state.selection.from);
    event.target.value = "";
  }
  function removeUpload(id: string) {
    if (!editor) return;
    const position = uploadPosition(editor, id);
    if (position !== null) editor.chain().setNodeSelection(position).deleteSelection().run();
    const job = jobs.current.get(id);
    if (job) URL.revokeObjectURL(job.preview);
    jobs.current.delete(id);
    syncJobs();
  }
  function moveImage(direction: -1 | 1) {
    if (!editor || !selected) return;
    const node = editor.state.doc.nodeAt(selected.position);
    if (!node) return;
    const resolved = editor.state.doc.resolve(selected.position);
    const at =
      direction === -1
        ? selected.position - (resolved.nodeBefore?.nodeSize ?? 0)
        : selected.position +
          node.nodeSize +
          (editor.state.doc.nodeAt(selected.position + node.nodeSize)?.nodeSize ?? 0);
    if (at < 0 || at > editor.state.doc.content.size || at === selected.position) return;
    const transaction = editor.state.tr.delete(
      selected.position,
      selected.position + node.nodeSize,
    );
    transaction.insert(transaction.mapping.map(at), node);
    editor.view.dispatch(transaction);
  }
  return (
    <div className="content-editor">
      <p id={labelId} className="sr-only">
        본문 편집
      </p>
      <input type="hidden" name={name} value={JSON.stringify(document)} />
      <input type="hidden" name={textName} value={contentPlainText(document)} />
      <input type="hidden" name="contentMediaReady" value={ready ? "true" : "false"} />
      <div className="content-toolbar" role="toolbar" aria-label="본문 작성 도구">
        <button
          type="button"
          disabled={!editor || disabled}
          aria-label="굵게"
          aria-pressed={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          disabled={!editor || disabled}
          aria-label="기울임"
          aria-pressed={editor?.isActive("italic") ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          disabled={!editor || disabled}
          aria-label="목록"
          aria-pressed={editor?.isActive("bulletList") ?? false}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          disabled={!editor || disabled}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={16} />
          이미지 추가
        </button>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          ref={fileInput}
          className="sr-only"
          aria-label="본문 이미지 파일 선택"
          onChange={choose}
          disabled={disabled}
        />
      </div>
      {editor ? (
        <div className="content-editor-surface">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <p className="content-loading" role="status">
          본문 편집기를 준비하고 있습니다…
        </p>
      )}
      <p className="content-help">
        사진을 원하는 문단 사이에 끌어 놓거나 이미지 추가를 누르세요. 이미지를 선택하면
        이동·설명·삭제를 할 수 있습니다. PNG·JPG·WebP, 이미지당 {IMAGE_UPLOAD_LIMIT_LABEL}, 최대
        10개.
      </p>
      {selected && (
        <div className="content-image-controls">
          <label>
            이미지 설명
            <input
              value={selected.alt}
              maxLength={300}
              onChange={(event) =>
                editor
                  ?.chain()
                  .setNodeSelection(selected.position)
                  .updateAttributes("image", { alt: event.target.value })
                  .run()
              }
              disabled={disabled}
            />
          </label>
          <button
            type="button"
            aria-label="이미지 위로 이동"
            onClick={() => moveImage(-1)}
            disabled={disabled}
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            aria-label="이미지 아래로 이동"
            onClick={() => moveImage(1)}
            disabled={disabled}
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            aria-label="선택한 이미지 삭제"
            onClick={() =>
              editor?.chain().setNodeSelection(selected.position).deleteSelection().run()
            }
            disabled={disabled}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {uploads.length > 0 && (
        <div className="content-upload-list" aria-live="polite">
          {uploads.map((job) => (
            <div key={job.id}>
              <span>
                {job.file.name} · {job.message}
              </span>
              {job.state === "ERROR" && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (editor) void upload(editor, job);
                  }}
                >
                  다시 시도
                </button>
              )}
              <button type="button" disabled={disabled} onClick={() => removeUpload(job.id)}>
                제거
              </button>
            </div>
          ))}
        </div>
      )}
      {(error || documentError) && (
        <p role="alert" className="content-error">
          {documentError || error}
        </p>
      )}
      <p className="content-upload-status">
        {contentPlainText(document).length.toLocaleString()} / {maxTextLength.toLocaleString()}자
        {uploads.length ? " · 이미지를 준비한 뒤 글을 저장할 수 있습니다." : ""}
      </p>
    </div>
  );
}
