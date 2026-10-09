"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EditableMemberProfile } from "@/lib/server/member-management";
import type { ProfileImageState } from "@/lib/profile-image";
import { ProfileFields } from "../onboarding/profile-form";
import { ProfileImageEditor, type ProfileImageDraft } from "./profile-image-form";
import { saveProfileSettings } from "./profile-actions";

export function SettingsProfileForm({
  initial,
  name,
  image: initialImage,
  isMock = false,
}: {
  initial: EditableMemberProfile | null;
  name: string;
  image: ProfileImageState | null;
  isMock?: boolean;
}) {
  const router = useRouter();
  const imageSourceKey = JSON.stringify(initialImage);
  const [savedImage, setSavedImage] = useState<{
    sourceKey: string;
    value: ProfileImageState;
  } | null>(null);
  const image = savedImage?.sourceKey === imageSourceKey ? savedImage.value : initialImage;
  const [draft, setDraft] = useState<ProfileImageDraft | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="settings-profile-form"
      aria-label="내 프로필 수정"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const input = new FormData(event.currentTarget);
        // A native file input can contain an empty File or a rejected later selection. Use only
        // the validated preview draft, so KEEP/REMOVE never forwards an accidental upload.
        input.delete("image");
        input.set("imageAction", draft?.action ?? "KEEP");
        if (draft?.action === "UPLOAD") input.set("image", draft.file);
        setFeedback(null);
        startTransition(async () => {
          try {
            const result = await saveProfileSettings(input);
            setFeedback(result);
            if (result.ok) {
              if (result.imageUrl !== undefined && result.hasCustomImage !== undefined)
                setSavedImage({
                  sourceKey: imageSourceKey,
                  value: { imageUrl: result.imageUrl, hasCustomImage: result.hasCustomImage },
                });
              setDraft(null);
              router.refresh();
            }
          } catch {
            setFeedback({
              ok: false,
              message:
                "프로필을 저장하지 못했습니다. 입력한 정보와 선택한 이미지는 유지됩니다. 연결 확인 후 다시 시도해 주세요.",
            });
          }
        });
      }}
    >
      <fieldset className="settings-profile-fieldset" disabled={pending} aria-busy={pending}>
        <legend className="sr-only">내 프로필과 이미지</legend>
        {image ? (
          <ProfileImageEditor
            name={name}
            image={image}
            draft={draft}
            isMock={isMock}
            onChange={(next) => {
              setDraft(next);
              setFeedback(null);
            }}
            onError={(message) => setFeedback({ ok: false, message })}
          />
        ) : (
          <div className="settings-load-error profile-image-load-error" role="alert">
            <p>
              프로필 이미지를 불러오지 못했습니다. 아래 프로필 정보는 기존 이미지를 유지하며 저장할
              수 있습니다.
            </p>
            <a className="button" href="/settings">
              이미지 다시 불러오기
            </a>
          </div>
        )}
        <div className="onboarding-form">
          <ProfileFields initial={initial} />
          <button
            className="button button-primary profile-field-wide"
            type="submit"
            disabled={pending}
          >
            {pending ? "저장 중…" : "프로필 수정하기"}
          </button>
          {feedback && (
            <p
              role={feedback.ok ? "status" : "alert"}
              className={`profile-field-wide ${feedback.ok ? "onboarding-success" : "auth-error"}`}
            >
              {feedback.message}
            </p>
          )}
        </div>
      </fieldset>
    </form>
  );
}
