"use client";

import { startTransition, useActionState, useRef, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AdministrationActionState } from "@/lib/admin-format";

export function AdminForm({
  action,
  children,
  submitLabel,
  disabled = false,
  submitDisabled = false,
}: {
  action: (state: AdministrationActionState, form: FormData) => Promise<AdministrationActionState>;
  children: ReactNode;
  submitLabel: string;
  disabled?: boolean;
  submitDisabled?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [state, submit, pending] = useActionState(
    async (previous: AdministrationActionState, form: FormData) => {
      try {
        const result = await action(previous, form);
        if (result.ok) {
          if (!form.get("id")) formRef.current?.reset();
          if (result.href) router.push(result.href);
        }
        return result;
      } catch {
        return {
          ok: false,
          message: "연결을 확인하고 다시 저장해주세요. 입력한 내용은 유지됩니다.",
        };
      } finally {
        submitting.current = false;
      }
    },
    { ok: false, message: "" },
  );
  function preserveInputSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending || disabled || submitDisabled) return;
    submitting.current = true;
    const form = new FormData(event.currentTarget);
    startTransition(() => submit(form));
  }
  return (
    <form ref={formRef} onSubmit={preserveInputSubmit} className="cms-form">
      <fieldset className="cms-fields" disabled={pending || disabled}>
        {children}
        {!disabled && (
          <button
            type="submit"
            className="button button-primary"
            disabled={pending || submitDisabled}
          >
            {pending ? "저장 중…" : submitLabel}
          </button>
        )}
      </fieldset>
      {state.message && (
        <p
          className={`cms-message ${state.ok ? "" : "is-error"}`}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
