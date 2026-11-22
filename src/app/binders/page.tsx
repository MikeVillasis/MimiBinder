import type { Metadata } from "next";
import { Suspense } from "react";
import { BindersView } from "@/components/BindersView";

export const metadata: Metadata = { title: "Binders" };

export default function Page() {
  return (
    <Suspense>
      <BindersView />
    </Suspense>
  );
}
