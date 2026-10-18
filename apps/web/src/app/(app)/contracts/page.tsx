import { DocumentsList } from "../documents-list";

export default async function Contracts({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string; status?: string }>;
}) {
  const { notice, q, status } = await searchParams;
  return <DocumentsList type="work_contract" notice={notice} q={q} status={status} />;
}
