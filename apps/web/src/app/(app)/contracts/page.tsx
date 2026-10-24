import { DocumentsList } from "../documents-list";

export default async function Contracts({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string; status?: string; p?: string }>;
}) {
  const { notice, q, status, p } = await searchParams;
  return <DocumentsList type="work_contract" notice={notice} q={q} status={status} p={p} />;
}
