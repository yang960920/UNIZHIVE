"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveBuildLoadout, restoreBuildLoadout } from "@/app/lab/loadouts/actions";

export function LoadoutArchiveControl({
  id,
  updatedAt,
  archived,
}: {
  id: string;
  updatedAt: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    archived ? restoreBuildLoadout : archiveBuildLoadout,
    { ok: false, message: "" },
  );
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={action} className="loadout-archive">
      <input name="loadoutId" type="hidden" value={id} />
      <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
      <button className="button button-quiet" type="submit" disabled={pending || state.ok}>
        {pending ? "저장하는 중…" : archived ? "로드아웃 복원" : "로드아웃 보관"}
      </button>
      {state.message && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}
    </form>
  );
}
export function LoadoutCopyButton({ text }: { text: string }) {
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        type="button"
        className="button button-quiet"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setMessage("준비 목록을 복사했습니다.");
          } catch {
            setMessage("복사하지 못했습니다. 아래 목록을 직접 선택해주세요.");
          }
        }}
      >
        준비 목록 복사
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
