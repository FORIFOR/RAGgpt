import { redirect } from "next/navigation";

export default function Legacy({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/n/${params.id}`);
}
