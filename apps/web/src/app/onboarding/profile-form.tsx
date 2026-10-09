"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveOnboarding } from "./actions";
import type { EditableMemberProfile } from "@/lib/server/member-management";

export function ProfileForm({
  initial,
  context = "onboarding",
}: {
  initial?: EditableMemberProfile | null;
  context?: "onboarding" | "settings";
}) {
  const [state, action, pending] = useActionState(saveOnboarding, { ok: false, message: "" });
  return (
    <form className="onboarding-form" action={action}>
      <ProfileFields initial={initial} />
      <button className="button button-primary profile-field-wide" type="submit" disabled={pending}>
        {pending ? "저장 중…" : initial ? "프로필 수정하기" : "프로필 등록하기"}
      </button>
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`profile-field-wide ${state.ok ? "onboarding-success" : "auth-error"}`}
        >
          {state.message}
        </p>
      )}
      {state.ok && context === "onboarding" && (
        <Link className="button profile-field-wide" href="/">
          대시보드로 돌아가기
        </Link>
      )}
    </form>
  );
}

export function ProfileFields({ initial }: { initial?: EditableMemberProfile | null }) {
  return (
    <>
      <label className="profile-field" htmlFor="handle">
        멤버 식별자
        <input
          id="handle"
          name="handle"
          required
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z0-9_-]+"
          autoComplete="username"
          placeholder="예: kiri"
          defaultValue={initial?.handle ?? ""}
        />
        <small>예: hyunjun. 계정을 구분할 영문, 숫자, - 및 _로 3~24자를 입력하세요.</small>
      </label>
      <label className="profile-field" htmlFor="displayName">
        표시 이름
        <input
          id="displayName"
          name="displayName"
          required
          minLength={2}
          maxLength={32}
          placeholder="시즌·파티·게시글에서 사용할 이름"
          defaultValue={initial?.displayName ?? ""}
        />
      </label>
      <label className="profile-field" htmlFor="nickname">
        Once Human 닉네임
        <input
          id="nickname"
          name="nickname"
          required
          minLength={2}
          maxLength={32}
          placeholder="게임에서 사용하는 이름"
          defaultValue={initial?.nickname ?? ""}
        />
      </label>
      <label className="profile-field" htmlFor="uid">
        Once Human UID
        <input
          id="uid"
          name="uid"
          required
          maxLength={32}
          placeholder="게임 내 UID"
          autoComplete="off"
          defaultValue={initial?.uid ?? ""}
        />
        <small>UID는 멤버 확인 용도로만 저장되며 공개 프로필에 표시되지 않습니다.</small>
      </label>
      <label className="profile-field profile-field-wide" htmlFor="bio">
        공개 소개
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={initial?.bio ?? ""}
          placeholder="함께하는 멤버에게 전할 소개 (선택)"
        />
        <small>공개되는 내용입니다. UID 등 개인정보를 적지 마세요.</small>
      </label>
    </>
  );
}
