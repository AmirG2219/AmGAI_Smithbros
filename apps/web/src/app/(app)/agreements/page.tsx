import { DocumentsList } from "../documents-list";

export default async function Agreements({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string; status?: string; p?: string }>;
}) {
  const { notice, q, status, p } = await searchParams;
  return <DocumentsList type="policy_liability" notice={notice} q={q} status={status} p={p} />;
}
