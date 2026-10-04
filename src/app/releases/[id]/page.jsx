import { notFound } from "next/navigation";
import { Workspace } from "@/components/Workspace";

export default async function ReleasePage({ params }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <Workspace id={id} />;
}
