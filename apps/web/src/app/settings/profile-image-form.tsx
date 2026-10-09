"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleHelp, Trash2, UserRound, X } from "lucide-react";
import { Avatar } from "@uniz/ui";
import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  type ProfileImageState,
} from "@/lib/profile-image";
import { IMAGE_UPLOAD_LIMIT_LABEL } from "@/lib/image-upload-limits";

const IMAGE_TYPES = new Set<string>(PROFILE_IMAGE_TYPES);
export type ProfileImageDraft =
  { action: "UPLOAD"; file: File; preview: string } | { action: "REMOVE" };

export function ProfileImageEditor({
  name,
  image,
  draft,
  onChange,
  onError,
  isMock = false,
}: {
  name: string;
  image: ProfileImageState;
  draft: ProfileImageDraft | null;
  onChange: (draft: ProfileImageDraft | null) => void;
  onError: (message: string) => void;
  isMock?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const preview =
    draft?.action === "UPLOAD" ? draft.preview : draft?.action === "REMOVE" ? null : image.imageUrl;
  const previewUrl = draft?.action === "UPLOAD" ? draft.preview : null;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function clearFileInput() {
    if (fileInput.current) fileInput.current.value = "";
  }
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      onError("PNG, JPG 또는 WebP 이미지를 선택해 주세요. GIF와 SVG는 사용할 수 없습니다.");
      clearFileInput();
      return;
    }
    if (file.size === 0 || file.size > PROFILE_IMAGE_MAX_BYTES) {
      onError(`크기가 0보다 크고 ${IMAGE_UPLOAD_LIMIT_LABEL} 이하인 이미지를 선택해 주세요.`);
      clearFileInput();
      return;
    }
    try {
      onChange({ action: "UPLOAD", file, preview: URL.createObjectURL(file) });
    } catch {
      onError("이미지 미리보기를 준비하지 못했습니다. 파일을 다시 선택해 주세요.");
      clearFileInput();
    }
  }

  return (
    <div className="profile-image-editor">
      <div className="profile-image-fields">
        <div className="profile-image-preview" aria-label="프로필 이미지 미리보기">
          {preview ? (
            <Image src={preview} alt="선택한 프로필 이미지" width={112} height={112} unoptimized />
          ) : (
            <Avatar name={name} size="lg" />
          )}
        </div>
        <div className="profile-image-controls">
          <h3>프로필 이미지</h3>
          <p id="profile-image-help">
            PNG·JPG·WebP, 최대 {IMAGE_UPLOAD_LIMIT_LABEL}. 얼굴이나 캐릭터가 중앙에 있는 정사각형
            이미지를 권장합니다.
          </p>
          <label className="sr-only" htmlFor="profile-image-file">
            프로필 이미지 파일 선택
          </label>
          <input
            key={previewUrl ?? draft?.action ?? image.imageUrl ?? "default"}
            id="profile-image-file"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby="profile-image-help"
            ref={fileInput}
            onChange={chooseFile}
          />
          {draft?.action === "UPLOAD" && (
            <small className="profile-image-filename">선택한 파일: {draft.file.name}</small>
          )}
          <div className="profile-image-actions">
            <button
              type="button"
              className="button button-quiet"
              disabled={
                (!image.hasCustomImage && draft?.action !== "UPLOAD") || draft?.action === "REMOVE"
              }
              onClick={() => {
                onChange(image.hasCustomImage ? { action: "REMOVE" } : null);
                clearFileInput();
              }}
            >
              <Trash2 size={14} />
              이미지 삭제
            </button>
            {draft && (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  onChange(null);
                  clearFileInput();
                }}
              >
                이미지 변경 취소
              </button>
            )}
          </div>
          {draft && (
            <p role="status" className="profile-image-status">
              {draft.action === "REMOVE"
                ? "프로필 수정하기를 누르면 기본 아이콘으로 돌아갑니다."
                : "미리보기입니다. 프로필 수정하기를 누르면 이미지와 프로필 정보를 함께 저장합니다."}
            </p>
          )}
          {isMock && <small>개발 계정에서는 이미지 미리보기만 사용할 수 있습니다.</small>}
        </div>
      </div>
      <ProfileImageGuide />
    </div>
  );
}

export function ProfileImageGuide() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="profile-image-guide-trigger">
          <CircleHelp size={15} />
          등록 예시 보기
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content profile-image-guide-dialog">
          <div className="dialog-heading">
            <Dialog.Title>프로필 이미지 등록 안내</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="안내 닫기">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="dialog-description">
            얼굴이나 캐릭터가 중앙에 있는 정사각형 이미지를 선택해 주세요. 프로필에는 가운데 부분이
            원형으로 보입니다.
          </Dialog.Description>
          <div className="profile-image-examples">
            <figure>
              <div className="profile-image-example-square" aria-hidden="true">
                <UserRound size={84} strokeWidth={1.1} />
                <span />
              </div>
              <figcaption>
                <strong>등록할 이미지</strong>
                <span>중앙에 배치하고 테두리에 여유를 주세요.</span>
              </figcaption>
            </figure>
            <figure>
              <div className="profile-image-example-circle" aria-hidden="true">
                <UserRound size={84} strokeWidth={1.1} />
              </div>
              <figcaption>
                <strong>프로필 표시 예시</strong>
                <span>모서리와 가장자리 일부는 보이지 않습니다.</span>
              </figcaption>
            </figure>
          </div>
          <ul className="profile-image-guide-notes">
            <li>가로·세로 512픽셀 이상의 이미지를 권장합니다.</li>
            <li>긴 이미지는 중앙을 기준으로 정사각형으로 잘라 저장합니다.</li>
            <li>
              PNG, JPG 또는 WebP 파일을 사용할 수 있으며 최대 크기는 {IMAGE_UPLOAD_LIMIT_LABEL}
              입니다.
            </li>
            <li>PNG·WebP의 투명 배경은 유지됩니다. JPG는 투명 배경을 지원하지 않습니다.</li>
            <li>GIF와 SVG는 사용할 수 없습니다. 사진을 삭제하면 기본 아이콘이 표시됩니다.</li>
          </ul>
          <Dialog.Close asChild>
            <button type="button" className="button profile-image-guide-done">
              확인
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
