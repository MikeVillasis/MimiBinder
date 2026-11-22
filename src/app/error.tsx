"use client";

import { Button, EmptyState } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        title="Something went wrong"
        body={error.message || "An unexpected error happened. Try again."}
        icon={
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l9 16H3z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
        }
      >
        <Button onClick={reset}>Try again</Button>
      </EmptyState>
    </div>
  );
}
