import type { Metadata } from "next";
import { CollectionView } from "@/components/CollectionView";

export const metadata: Metadata = { title: "Collection" };

export default function Page() {
  return <CollectionView />;
}
