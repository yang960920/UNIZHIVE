"use client";

import { AuthRetryNotice } from "@/components/auth-retry-notice";

export default function AdminError({ retry }: { retry: () => void }) {
  return <AuthRetryNotice onRetry={retry} />;
}
