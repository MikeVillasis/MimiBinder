"use client";

import Link from "next/link";
import { EmptyState, buttonCls } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      body="That page does not exist, or it has moved."
      icon={
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5M9 9l4 4M13 9l-4 4" />
        </svg>
      }
    >
      <Link href="/" className={buttonCls({ variant: "primary" })}>
        Go home
      </Link>
    </EmptyState>
  );
}
