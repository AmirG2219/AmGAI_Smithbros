import Link from "next/link";
import { FileSignature, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "../ui";

export default async function Documents() {
  const supabase = await createClient();
  const count = (type: string) =>
    supabase
      .from("agreements")
      .select("id", { count: "exact", head: true })
      .eq("document_type", type)
      .not("status", "in", "(cancelled,superseded)")
      .then((r) => r.count ?? 0);
  const [contracts, agreements] = await Promise.all([count("work_contract"), count("policy_liability")]);

  const cards = [
    {
      title: "Contracts",
      Icon: FileSignature,
      n: contracts,
      blurb: "The flooring contract for a job: scope of work, price, deposit, schedule and warranty.",
      list: "/contracts",
      create: "/documents/new?type=work_contract",
      createLabel: "Create a contract",
    },
    {
      title: "Agreements",
      Icon: FileText,
      n: agreements,
      blurb: "The policy and liability agreement a client signs before work begins.",
      list: "/agreements",
      create: "/documents/new?type=policy_liability",
      createLabel: "Create an agreement",
    },
  ];

  return (
    <div>
      <PageHeader eyebrow="Paperwork" title="Documents" />
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-muted">What would you like to do?</p>
      <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
        {cards.map(({ title, Icon, n, blurb, list, create, createLabel }) => (
          <Card key={title} className="flex flex-col p-6">
            <Icon className="mb-3 text-bronze" size={28} strokeWidth={1.5} />
            <p className="font-serif text-2xl">{title}</p>
            <p className="mt-1 flex-1 text-sm text-muted">{blurb}</p>
            <p className="mt-4 text-sm">
              <span className="font-serif text-3xl">{n}</span> <span className="text-muted">current</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={create} className="rounded-lg bg-walnut px-4 py-2.5 text-sm font-medium text-cream hover:bg-bronze">
                {createLabel}
              </Link>
              <Link href={list} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:border-bronze">
                View all
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
