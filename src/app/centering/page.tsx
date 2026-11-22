import type { Metadata } from "next";
import { CenteringTool } from "@/components/centering/CenteringTool";

export const metadata: Metadata = { title: "Centering check" };

export default function Page() {
  return <CenteringTool />;
}
