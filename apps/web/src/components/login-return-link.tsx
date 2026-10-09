"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSafeLoginDestination } from "@/lib/login-flow";

function destinationHref(pathname: string, query = "") {
  const destination = getSafeLoginDestination(`${pathname}${query ? `?${query}` : ""}`);
  return `/login?callbackUrl=${encodeURIComponent(destination)}`;
}

function CurrentPageLoginLink({ pathname, children }: { pathname: string; children: ReactNode }) {
  const query = useSearchParams().toString();
  return (
    <Link href={destinationHref(pathname, query)} prefetch={false} className="button login-button">
      {children}
    </Link>
  );
}

/** Keep version/search parameters when a session expires, without suspending the whole navbar. */
export function LoginReturnLink({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Link href={destinationHref(pathname)} prefetch={false} className="button login-button">
          {children}
        </Link>
      }
    >
      <CurrentPageLoginLink pathname={pathname}>{children}</CurrentPageLoginLink>
    </Suspense>
  );
}
