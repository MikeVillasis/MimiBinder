import { SerieBinderView } from "@/components/SerieBinderView";

export default async function Page({ params }: PageProps<"/binders/serie/[serieId]">) {
  const { serieId } = await params;
  return <SerieBinderView serieId={decodeURIComponent(serieId)} />;
}
