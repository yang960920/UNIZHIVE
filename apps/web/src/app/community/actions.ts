"use server";

import { revalidatePath } from "next/cache";
import { fromKstInput, type AdministrationActionState } from "@/lib/admin-format";
import {
  saveCommunityPost,
  archiveCommunityPost,
  moderateCommunityPost,
  saveCommunityComment,
  archiveCommunityComment,
  moderateCommunityComment,
  saveAnnouncement,
  archiveAnnouncement,
  CommunityError,
} from "@/lib/server/community-repository";
import {
  communityCategoryLabels,
  communityHref,
  communityPostHref,
} from "@/components/community/presentation";

function refreshCommunity() {
  revalidatePath("/community", "layout");
  revalidatePath("/admin/community", "layout");
  revalidatePath("/announcements", "layout");
  revalidatePath("/");
}
function versionFields(form: FormData) {
  return form.get("id")
    ? { id: form.get("id"), expectedUpdatedAt: form.get("expectedUpdatedAt") }
    : {};
}
function returnFilters(form: FormData) {
  const q =
    typeof form.get("returnQ") === "string" ? String(form.get("returnQ")).slice(0, 120) : "";
  const category = form.get("returnCategory");
  const page = Number(form.get("returnPage"));
  const section = form.get("returnSection");
  return {
    q,
    category:
      typeof category === "string" && Object.hasOwn(communityCategoryLabels, category)
        ? category
        : null,
    page: Number.isInteger(page) && page > 0 && page <= 10000 ? page : 1,
    ...(section === "SHOWCASE" || category === "SHOWCASE" ? { section: "SHOWCASE" as const } : {}),
  };
}
function failed(error: unknown): AdministrationActionState {
  return {
    ok: false,
    message:
      error instanceof CommunityError
        ? error.message
        : "저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.",
  };
}

export async function saveCommunityPostForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    if (form.get("contentMediaReady") === "false")
      return { ok: false, message: "이미지 등록을 마친 후 글을 저장해 주세요." };
    const result = await saveCommunityPost({
      ...versionFields(form),
      title: form.get("title"),
      body: form.get("body"),
      ...(form.has("bodyDocument") ? { bodyDocument: form.get("bodyDocument") } : {}),
      ...(form.has("youtubeUrl") ? { youtubeUrl: form.get("youtubeUrl") || null } : {}),
      category: form.get("category"),
      buildVersionId: form.get("buildVersionId") || null,
      isPinned: form.get("isPinned") === "on",
    });
    refreshCommunity();
    return {
      ok: true,
      message: "글을 저장했습니다.",
      href: communityPostHref(result.id, {
        ...returnFilters(form),
        ...(form.get("category") === "SHOWCASE" ? { section: "SHOWCASE" as const } : {}),
      }),
    };
  } catch (error) {
    return failed(error);
  }
}
export async function archiveCommunityPostForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    await archiveCommunityPost({
      id: form.get("id"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
    });
    refreshCommunity();
    return { ok: true, message: "글을 보관했습니다.", href: communityHref(returnFilters(form)) };
  } catch (error) {
    return failed(error);
  }
}
export async function moderateCommunityPostForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    await moderateCommunityPost({
      id: form.get("id"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
      action: form.get("action"),
    });
    refreshCommunity();
    return { ok: true, message: "글의 표시 상태를 변경했습니다." };
  } catch (error) {
    return failed(error);
  }
}
export async function saveCommunityCommentForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    const result = await saveCommunityComment({
      ...versionFields(form),
      postId: form.get("postId"),
      body: form.get("body"),
      ...(form.has("parentId") ? { parentId: form.get("parentId") || null } : {}),
    });
    refreshCommunity();
    return {
      ok: true,
      message: form.get("parentId") ? "답글을 저장했습니다." : "댓글을 저장했습니다.",
      ...(!form.get("id")
        ? {
            href: form.get("parentId")
              ? `${communityPostHref(String(form.get("postId")), returnFilters(form))}${communityPostHref(String(form.get("postId")), returnFilters(form)).includes("?") ? "&" : "?"}replyRoot=${encodeURIComponent(String(form.get("parentId")))}&replyPage=100000#comment-${result.id}`
              : communityPostHref(String(form.get("postId")), returnFilters(form)),
          }
        : {}),
    };
  } catch (error) {
    return failed(error);
  }
}
export async function archiveCommunityCommentForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    await archiveCommunityComment({
      id: form.get("id"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
    });
    refreshCommunity();
    return { ok: true, message: "댓글을 삭제했습니다." };
  } catch (error) {
    return failed(error);
  }
}
export async function moderateCommunityCommentForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    await moderateCommunityComment({
      id: form.get("id"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
      action: form.get("action"),
    });
    refreshCommunity();
    return { ok: true, message: "댓글의 표시 상태를 변경했습니다." };
  } catch (error) {
    return failed(error);
  }
}
export async function saveAnnouncementForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    const input = form.get("publishedAt");
    let publishedAt: string | null = null;
    if (input !== null && input !== "") {
      try {
        publishedAt = fromKstInput(input, false, form.get("originalPublishedAt"));
      } catch {
        return {
          ok: false,
          message: "발행일시를 확인해주세요. 유효한 날짜와 시간을 한국 시간으로 입력합니다.",
        };
      }
    }
    const result = await saveAnnouncement({
      ...versionFields(form),
      title: form.get("title"),
      content: form.get("content"),
      isPinned: form.get("isPinned") === "on",
      ...(publishedAt ? { publishedAt } : {}),
    });
    refreshCommunity();
    return { ok: true, message: "공지를 저장했습니다.", href: `/announcements/${result.id}` };
  } catch (error) {
    return failed(error);
  }
}
export async function archiveAnnouncementForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    await archiveAnnouncement({
      id: form.get("id"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
    });
    refreshCommunity();
    return { ok: true, message: "공지를 보관했습니다.", href: "/admin/community" };
  } catch (error) {
    return failed(error);
  }
}
