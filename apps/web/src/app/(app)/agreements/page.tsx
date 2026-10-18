import { DocumentsList } from "../documents-list";

export default async function Agreements({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return <DocumentsList type="policy_liability" notice={notice} />;
}
