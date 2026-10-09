"use client";

import { Fragment, startTransition, useActionState, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toKstInput, type AdministrationActionState } from "../../lib/admin-format";
import type {
  CommunityEditorData,
  CommunityComment,
  AnnouncementDetail,
} from "../../lib/server/community-repository";
import {
  saveCommunityPostForm,
  saveCommunityCommentForm,
  archiveCommunityPostForm,
  moderateCommunityPostForm,
  archiveCommunityCommentForm,
  moderateCommunityCommentForm,
  saveAnnouncementForm,
  archiveAnnouncementForm,
} from "../../app/community/actions";
import { communityCategoryLabels, communityHref } from "./presentation";
import "./community.css";
import { ContentEditor } from "../content/editor";
import { YouTubeField } from "../content/presentation";
import type { CommunitySection } from "../../lib/community-policy";

type FormAction = (
  previous: AdministrationActionState,
  form: FormData,
) => Promise<AdministrationActionState>;
export type CommunityReturnFilters = {
  q?: string;
  category?: string | null;
  page?: number;
  section?: CommunitySection;
};

export function CommunityActionForm({
  action,
  label,
  children,
  resetOnSuccess = false,
}: {
  action: FormAction;
  label: string;
  children: ReactNode;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submitBusy = useRef(false);
  const [state, submit, pending] = useActionState(
    async (previous: AdministrationActionState, form: FormData) => {
      try {
        const result = await action(previous, form);
        if (result.ok) {
          if (resetOnSuccess) formRef.current?.reset();
          if (result.href) router.push(result.href);
        }
        return result;
      } catch {
        return {
          ok: false,
          message: "연결을 확인한 뒤 다시 저장해주세요. 입력한 내용은 그대로 유지됩니다.",
        };
      } finally {
        submitBusy.current = false;
      }
    },
    { ok: false, message: "" },
  );
  return (
    <form
      ref={formRef}
      className="community-action-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || submitBusy.current) return;
        const form = new FormData(event.currentTarget);
        submitBusy.current = true;
        startTransition(() => submit(form));
      }}
    >
      <fieldset className="community-fields" disabled={pending}>
        {children}
        <button type="submit" className="button button-primary">
          {pending ? "저장 중…" : label}
        </button>
      </fieldset>
      {state.message && (
        <p
          className={`community-form-message ${state.ok ? "" : "is-error"}`}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
export function ReturnFields({ filters = {} }: { filters?: CommunityReturnFilters }) {
  return (
    <>
      <input type="hidden" name="returnQ" value={filters.q ?? ""} />
      <input type="hidden" name="returnCategory" value={filters.category ?? ""} />
      <input type="hidden" name="returnPage" value={filters.page ?? 1} />
      <input
        type="hidden"
        name="returnSection"
        value={filters.section ?? (filters.category === "SHOWCASE" ? "SHOWCASE" : "")}
      />
    </>
  );
}
function VersionFields({ id, updatedAt }: { id: string; updatedAt: string }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
    </>
  );
}

export function CommunityPostForm({
  data,
  filters = {},
}: {
  data: CommunityEditorData;
  filters?: CommunityReturnFilters;
}) {
  const initial = data.initial;
  const showcase = initial
    ? initial.category === "SHOWCASE"
    : filters.section === "SHOWCASE" || filters.category === "SHOWCASE";
  const returnFilters = showcase
    ? { ...filters, category: null, section: "SHOWCASE" as const }
    : {
        ...filters,
        category: filters.category === "SHOWCASE" ? null : filters.category,
        ...(initial ? { section: "BOARD" as const } : {}),
      };
  const linkedMissing =
    initial?.buildVersionId &&
    !data.buildVersions.some((version) => version.id === initial.buildVersionId);
  return (
    <CommunityActionForm
      action={saveCommunityPostForm}
      label={initial ? "글 변경 저장" : "글 등록"}
    >
      <ReturnFields filters={returnFilters} />
      {initial && <VersionFields id={initial.id} updatedAt={initial.updatedAt} />}
      <Fragment key={initial?.updatedAt ?? "new-post"}>
        <label>
          글 제목
          <input
            name="title"
            required
            minLength={2}
            maxLength={160}
            defaultValue={initial?.title}
            placeholder="내용을 알아볼 수 있는 제목"
          />
        </label>
        <div className="community-form-columns">
          <label>
            분류
            <select
              name="category"
              defaultValue={
                initial?.category ??
                (showcase
                  ? "SHOWCASE"
                  : filters.category && Object.hasOwn(communityCategoryLabels, filters.category)
                    ? filters.category
                    : "GENERAL")
              }
            >
              {Object.entries(communityCategoryLabels)
                .filter(([key]) => (showcase ? key === "SHOWCASE" : key !== "SHOWCASE"))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            공유할 빌드 버전 · 선택
            <select name="buildVersionId" defaultValue={initial?.buildVersionId ?? ""}>
              <option value="">빌드 연결 안 함</option>
              {data.buildVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.title} · {version.version}번 버전 ·{" "}
                  {version.visibility === "HIVE" ? "하이브 공유" : "전체 공개"}
                </option>
              ))}
              {linkedMissing && (
                <option value={initial.buildVersionId!}>기존 연결 · 현재 접근 상태 변경</option>
              )}
            </select>
            <small className="community-note">
              글에는 선택한 버전이 고정됩니다. 빌드를 나중에 수정해도 이 글의 연결 버전은 바뀌지
              않습니다.
            </small>
          </label>
        </div>
        {linkedMissing && (
          <p className="community-note">
            기존 빌드의 공유 범위가 바뀌었습니다. 사용할 수 있는 공유 버전을 선택하거나 연결을
            해제해주세요.
          </p>
        )}
        {data.buildOptionsTruncated && (
          <p className="community-note">
            최근 공유 버전부터 표시합니다. 원하는 빌드는 <Link href="/lab">빌드 연구실</Link>에서
            공유 범위를 확인해주세요.
          </p>
        )}
        <ContentEditor
          initialDocument={initial?.bodyDocument ?? null}
          initialText={initial?.body ?? ""}
          maxTextLength={20000}
        />
        <YouTubeField initialUrl={initial?.youtubeUrl ?? null} />
        {data.canPin && (
          <label className="community-checkbox">
            <input type="checkbox" name="isPinned" defaultChecked={initial?.isPinned ?? false} />
            목록 상단에 고정
          </label>
        )}
      </Fragment>
      <p className="community-note">
        승인된 하이브 멤버에게 공개됩니다. 사진과 문단을 원하는 위치에 배치할 수 있습니다.
      </p>
      {showcase && (
        <p className="community-note">
          자랑 분류에서는 본문의 첫 사진이 목록의 대표 사진으로 표시됩니다. 사진과 짧은 설명만으로도
          우리만의 순간을 나눌 수 있습니다.
        </p>
      )}
      <p className="community-note">빌드 공유 분류에는 공유할 빌드 버전을 연결해주세요.</p>
      <Link className="community-back" href={communityHref(returnFilters)}>
        {showcase ? "자랑하기 목록으로" : "글 목록으로"}
      </Link>
    </CommunityActionForm>
  );
}

export function CommunityCommentForm({
  postId,
  comment,
  parentId,
  filters = {},
}: {
  postId: string;
  comment?: CommunityComment;
  parentId?: string;
  filters?: CommunityReturnFilters;
}) {
  const replyParent = parentId ?? comment?.parentId ?? null;
  const label = replyParent ? "답글" : "댓글";
  return (
    <CommunityActionForm
      action={saveCommunityCommentForm}
      label={comment ? `${label} 변경 저장` : `${label} 등록`}
      resetOnSuccess={!comment}
    >
      <input type="hidden" name="postId" value={postId} />
      {replyParent && <input type="hidden" name="parentId" value={replyParent} />}
      <ReturnFields filters={filters} />
      {comment && <VersionFields id={comment.id} updatedAt={comment.updatedAt} />}
      <label>
        {label}
        <textarea
          key={comment?.updatedAt ?? "new-comment"}
          name="body"
          required
          rows={3}
          maxLength={4000}
          defaultValue={comment?.body}
          placeholder="하이브 멤버들과 의견을 나눠주세요."
        />
      </label>
    </CommunityActionForm>
  );
}

export function PostArchiveForm({
  id,
  updatedAt,
  filters,
  label = "글 보관",
}: {
  id: string;
  updatedAt: string;
  filters?: CommunityReturnFilters;
  label?: string;
}) {
  return (
    <CommunityActionForm action={archiveCommunityPostForm} label={label}>
      <VersionFields id={id} updatedAt={updatedAt} />
      <ReturnFields filters={filters} />
    </CommunityActionForm>
  );
}
export function PostModerationForm({
  id,
  updatedAt,
  action,
  label,
}: {
  id: string;
  updatedAt: string;
  action: "HIDE" | "SHOW" | "PIN" | "UNPIN";
  label: string;
}) {
  return (
    <CommunityActionForm action={moderateCommunityPostForm} label={label}>
      <VersionFields id={id} updatedAt={updatedAt} />
      <input type="hidden" name="action" value={action} />
    </CommunityActionForm>
  );
}
export function CommentArchiveForm({ comment }: { comment: CommunityComment }) {
  return (
    <CommunityActionForm
      action={archiveCommunityCommentForm}
      label={comment.parentId ? "답글 삭제" : "댓글 삭제"}
    >
      <VersionFields id={comment.id} updatedAt={comment.updatedAt} />
    </CommunityActionForm>
  );
}
export function CommentModerationForm({ comment }: { comment: CommunityComment }) {
  return (
    <CommunityActionForm
      action={moderateCommunityCommentForm}
      label={comment.hiddenAt ? "댓글 다시 표시" : "댓글 숨기기"}
    >
      <VersionFields id={comment.id} updatedAt={comment.updatedAt} />
      <input type="hidden" name="action" value={comment.hiddenAt ? "SHOW" : "HIDE"} />
    </CommunityActionForm>
  );
}

export function AnnouncementForm({ initial }: { initial?: AnnouncementDetail }) {
  return (
    <CommunityActionForm
      action={saveAnnouncementForm}
      label={initial ? "공지 변경 저장" : "공지 등록"}
    >
      {initial && <VersionFields id={initial.id} updatedAt={initial.updatedAt} />}
      <Fragment key={initial?.updatedAt ?? "new-notice"}>
        <label>
          공지 제목
          <input
            name="title"
            required
            minLength={2}
            maxLength={160}
            defaultValue={initial?.title}
          />
        </label>
        <label>
          공지 내용
          <textarea
            name="content"
            required
            rows={12}
            maxLength={20000}
            defaultValue={initial?.content}
          />
        </label>
        <label>
          발행일시 · 선택 (한국 시간)
          <input
            type="datetime-local"
            name="publishedAt"
            defaultValue={toKstInput(initial?.publishedAt)}
            aria-describedby="announcement-publish-help"
          />
          <small id="announcement-publish-help" className="community-note">
            {initial
              ? "빈 값으로 저장하면 기존 발행일시를 유지합니다. 미래 시간을 선택하면 그때부터 멤버에게 표시됩니다."
              : "비워두면 바로 발행합니다. 미래 시간을 선택하면 그때부터 멤버에게 표시됩니다."}
          </small>
        </label>
        {initial && <input type="hidden" name="originalPublishedAt" value={initial.publishedAt} />}
        <label className="community-checkbox">
          <input type="checkbox" name="isPinned" defaultChecked={initial?.isPinned ?? false} />
          상단에 고정
        </label>
      </Fragment>
      <p className="community-note">
        등록한 공지는 승인된 하이브 멤버의 홈과 커뮤니티에 표시됩니다.
      </p>
    </CommunityActionForm>
  );
}
export function AnnouncementArchiveForm({ announcement }: { announcement: AnnouncementDetail }) {
  return (
    <CommunityActionForm action={archiveAnnouncementForm} label="공지 보관">
      <VersionFields id={announcement.id} updatedAt={announcement.updatedAt} />
    </CommunityActionForm>
  );
}
