import { CalendarCheck, FilePen, FileStack, Inbox, Mail, Plus, Users } from "lucide-react";
import Link from "next/link";
import { STATUS } from "@/lib/agreements/status";
import { DOC_NAME, type DocType } from "@/lib/agreements/vars";
import { loadAttention } from "@/lib/dashboard/attention";
import { loadNavCounts, loadOverview } from "@/lib/dashboard/overview";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/supabase/session";
import { LEAD_COLUMNS, type LeadRow } from "./leads-table";
import { Card, greeting } from "./ui";

const TZ = "America/Edmonton";
const when = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, ...o });
const nice = (s: string | null | undefined) => (s ? s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) : "");

// Same colour meaning as the sidebar badges: amber needs you, blue is waiting or scheduled.
const dot = { amber: "bg-amber-500", blue: "bg-sky-500" };

type Item = { key: string; href: string; kind: string; tone: keyof typeof dot; title: string; detail: string };

function SectionHead({ title, href, link = "View all" }: { title: string; href?: string; link?: string }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <h2 className="font-serif text-xl">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-bronze hover:text-walnut">
          {link}
        </Link>
      )}
    </div>
  );
}

const row = "-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-line/50";

export default async function Dashboard() {
  const supabase = await createClient();

  // One parallel batch: a page never waits on more than one round trip to the database.
  const [recent, me, attention, o, counts] = await Promise.all([
    supabase.from("projects").select(LEAD_COLUMNS).order("created_at", { ascending: false }).limit(5),
    getMe(),
    loadAttention(supabase),
    loadOverview(supabase),
    loadNavCounts(supabase),
  ]);

  const agreementsToAct = o.agreementsReady + o.agreementsToVerify;
  const agreementsHref = o.agreementsToVerify === 0 ? "/agreements?tab=drafts" : o.agreementsReady === 0 ? "/agreements?tab=review" : "/agreements";
  const tiles = [
    { label: "Leads to follow up", value: o.followUp, Icon: Users, href: "/leads", note: "new or estimate sent" },
    { label: "Emails to reply to", value: counts.inbox, Icon: Inbox, href: "/inbox", note: "in the Inbox" },
    {
      label: "Agreements to action",
      value: agreementsToAct,
      Icon: FileStack,
      href: agreementsHref,
      note: `${o.agreementsReady} to send · ${o.agreementsToVerify} to verify`,
    },
    { label: "Upcoming consultations", value: o.upcomingTotal, Icon: CalendarCheck, href: "#consultations", note: "scheduled" },
  ];

  const items: Item[] = [
    ...attention.replies.slice(0, 3).map<Item>((r) => ({
      key: `e${r.id}`,
      href: `/inbox?e=${r.id}`,
      kind: "Email",
      tone: "amber",
      title: r.who,
      detail: `Needs reply · ${r.subject || "(no subject)"}`,
    })),
    ...o.reviewLeads.slice(0, 3).map<Item>((l) => ({
      key: `l${l.id}`,
      href: `/leads/${l.id}`,
      kind: "Lead",
      tone: "amber",
      title: l.name,
      detail: `Needs review${l.project ? ` · ${nice(l.project)}` : ""}`,
    })),
    ...o.agreementItems.slice(0, 3).map<Item>((a) => ({
      key: `a${a.id}`,
      href: `/agreements/${a.id}`,
      kind: "Agreement",
      tone: "amber",
      title: a.name,
      detail: `${a.status === "returned" ? "Signed copy to verify" : (STATUS[a.status]?.label ?? a.status)} · ${DOC_NAME[a.doc as DocType] ?? "Document"}`,
    })),
    ...attention.unbookedList.slice(0, 2).map<Item>((u) => ({
      key: `u${u.id}`,
      href: `/leads/${u.id}`,
      kind: "Lead",
      tone: "amber",
      title: u.name,
      detail: `Follow up · estimate sent ${u.daysSince} days ago, no booking`,
    })),
    ...attention.waitingList.slice(0, 2).map<Item>((w) => ({
      key: `w${w.emailId}`,
      href: "/inbox?f=waiting",
      kind: "Email",
      tone: "blue",
      title: w.name,
      detail: `Waiting on customer · ${w.daysWaiting} days · ${w.subject || "(no subject)"}`,
    })),
  ];

  const actions = [
    { label: "New Lead", href: "/leads/new", Icon: Plus },
    { label: "Compose Email", href: "/inbox?compose=1", Icon: Mail },
    { label: "New Agreement", href: "/agreements/new", Icon: FilePen },
  ];

  const leads = (recent.data ?? []) as LeadRow[];

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <h1 className="font-serif text-3xl">{greeting(me?.display_name ?? "there")}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {new Date().toLocaleDateString("en-CA", { timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map(({ label, value, Icon, href, note }) => (
          <Link key={label} href={href} className="group">
            <Card className="h-full p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-bronze group-hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <p className="eyebrow">{label}</p>
                <Icon size={16} strokeWidth={1.6} className="shrink-0 text-bronze" />
              </div>
              <p className="mt-3 font-serif text-4xl leading-none">{value}</p>
              <p className="mt-2 truncate text-xs text-muted">{note}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <SectionHead title="Needs attention" />
          <Card className="p-3 sm:p-4">
            {items.length === 0 ? (
              <p className="px-1 py-4 text-sm text-muted">You&apos;re all caught up. Nothing is waiting on you.</p>
            ) : (
              <ul>
                {items.map((i) => (
                  <li key={i.key}>
                    <Link href={i.href} className={row}>
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot[i.tone]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.title}</span>
                        <span className="block truncate text-xs text-muted">{i.detail}</span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted">{i.kind}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section className="min-w-0">
          <SectionHead title="Quick actions" />
          <div className="grid gap-2.5">
            {actions.map(({ label, href, Icon }, n) => (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  n === 0 ? "bg-walnut text-cream hover:bg-bronze" : "border border-line bg-card hover:border-bronze"
                }`}
              >
                <Icon size={17} strokeWidth={1.8} /> {label}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHead title="Recent leads" href="/leads" />
          <Card className="p-3 sm:p-4">
            {leads.length === 0 ? (
              <p className="px-1 py-4 text-sm text-muted">No leads yet.</p>
            ) : (
              <ul>
                {leads.map((l) => {
                  const c = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
                  return (
                    <li key={l.id}>
                      <Link href={`/leads/${l.id}`} className={row}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{`${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Lead"}</span>
                          <span className="block truncate text-xs text-muted">{nice(l.project_type) || "Project"}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs">{nice(l.stage)}</span>
                          <span className="block text-xs text-muted">{when(l.created_at, { month: "short", day: "numeric" })}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <section className="min-w-0">
          <SectionHead title="Recent emails" href="/inbox?f=all" />
          <Card className="p-3 sm:p-4">
            {o.recentEmails.length === 0 ? (
              <p className="px-1 py-4 text-sm text-muted">No emails yet.</p>
            ) : (
              <ul>
                {o.recentEmails.map((e) => (
                  <li key={e.id}>
                    <Link href={`/inbox?f=all&e=${e.id}`} className={`${row} items-start`}>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${e.unread ? "font-semibold" : "font-medium"}`}>{e.who}</span>
                        <span className="block truncate text-sm">{e.subject}</span>
                        <span className="block truncate text-xs text-muted">{e.preview}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs text-muted">{when(e.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        {e.needsReply ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Needs reply</span>
                        ) : (
                          e.unread && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-bronze">Unread</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <section id="consultations" className="min-w-0 scroll-mt-20">
        <SectionHead title="Upcoming consultations" />
        <Card className="p-3 sm:p-4">
          {o.upcoming.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted">No consultations scheduled.</p>
          ) : (
            <ul>
              {o.upcoming.map((u) => (
                <li key={u.projectId + u.at}>
                  <Link href={`/leads/${u.projectId}`} className={row}>
                    <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot.blue}`} />
                    <span className="w-40 shrink-0 text-sm">
                      {when(u.at, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                      {when(u.at, { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                    <span className="hidden shrink-0 text-xs text-muted sm:block">{nice(u.project)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
