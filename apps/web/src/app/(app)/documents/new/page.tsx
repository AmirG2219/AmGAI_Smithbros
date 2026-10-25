import { redirect } from "next/navigation";

// Old links from lead and client pages (?type=&project=&client=) open the new builder.
export default async function NewDocument({ searchParams }: { searchParams: Promise<{ type?: string; project?: string; client?: string }> }) {
  const { type, project, client } = await searchParams;
  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  if (client) qs.set("client", client);
  if (type === "work_contract") qs.set("docs", "contract");
  if (type === "policy_liability") qs.set("docs", "policy");
  redirect(`/agreements/new${qs.size ? `?${qs}` : ""}`);
}
