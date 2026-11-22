import { SetBinderView } from "@/components/SetBinderView";

export default async function Page({ params }: PageProps<"/binders/set/[setId]">) {
  const { setId } = await params;
  return <SetBinderView setId={decodeURIComponent(setId)} />;
}
