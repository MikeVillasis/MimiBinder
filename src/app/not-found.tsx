import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Page not found" body="That page does not exist.">
      <Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-accent-fg">
        Go home
      </Link>
    </EmptyState>
  );
}
