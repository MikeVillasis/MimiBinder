import { CardView } from "@/components/CardView";

export default async function Page({ params }: PageProps<"/card/[id]">) {
  const { id } = await params;
  return <CardView id={decodeURIComponent(id)} />;
}
