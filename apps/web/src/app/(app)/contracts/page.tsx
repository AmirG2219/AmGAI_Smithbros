import { DocumentsList } from "../documents-list";

export default async function Contracts({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return <DocumentsList type="work_contract" notice={notice} />;
}
