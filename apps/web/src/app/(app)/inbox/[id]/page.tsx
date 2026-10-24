import { redirect } from "next/navigation";

// Emails now open beside the list. This keeps old links working.
export default async function EmailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  redirect(`/inbox?e=${encodeURIComponent(id)}${notice ? `&notice=${encodeURIComponent(notice)}` : ""}`);
}
