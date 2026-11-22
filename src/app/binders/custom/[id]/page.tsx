import { CustomBinderView } from "@/components/CustomBinderView";

export default async function Page({ params }: PageProps<"/binders/custom/[id]">) {
  const { id } = await params;
  return <CustomBinderView id={decodeURIComponent(id)} />;
}
