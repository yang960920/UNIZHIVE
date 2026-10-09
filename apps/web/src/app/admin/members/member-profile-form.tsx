"use client";

import { useActionState, useId } from "react";
import type { EditableMemberProfile } from "@/lib/server/member-management";
import { updateMemberProfile } from "./actions";

export function MemberProfileEditor({ initial }: { initial: EditableMemberProfile }) {
  const [state, action, pending] = useActionState(updateMemberProfile, { ok: false, message: "" });
  const id = useId();
  return (
    <form className="member-profile-form" action={action}>
      <input type="hidden" name="targetId" value={initial.targetId} />
      <label htmlFor={`${id}-handle`}>
        프로필 주소
        <input
          id={`${id}-handle`}
          name="handle"
          required
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z0-9_-]+"
          defaultValue={initial.handle}
        />
      </label>
      <label htmlFor={`${id}-name`}>
        표시 이름
        <input
          id={`${id}-name`}
          name="displayName"
          required
          minLength={2}
          maxLength={32}
          defaultValue={initial.displayName}
        />
      </label>
      <label htmlFor={`${id}-nickname`}>
        Once Human 닉네임
        <input
          id={`${id}-nickname`}
          name="nickname"
          required
          minLength={2}
          maxLength={32}
          defaultValue={initial.nickname}
        />
      </label>
      <label htmlFor={`${id}-uid`}>
        Once Human UID
        <input
          id={`${id}-uid`}
          name="uid"
          required
          maxLength={32}
          autoComplete="off"
          defaultValue={initial.uid}
        />
        <small>본인과 승인 권한이 있는 운영진만 확인할 수 있는 정보입니다.</small>
      </label>
      <label htmlFor={`${id}-bio`}>
        공개 소개
        <textarea id={`${id}-bio`} name="bio" rows={4} maxLength={500} defaultValue={initial.bio} />
        <small>멤버 프로필에 공개됩니다. UID 등 개인정보를 적지 마세요.</small>
      </label>
      <button type="submit" className="button button-primary" disabled={pending}>
        {pending ? "저장 중…" : "프로필 저장"}
      </button>
      {state.message && (
        <p
          className={state.ok ? "onboarding-success" : "auth-error"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
