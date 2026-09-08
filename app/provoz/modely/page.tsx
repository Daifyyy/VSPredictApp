import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";
import { getModelGovernanceDashboard } from "@/lib/data/modelGovernance";

export const metadata = { title: "Řízení modelů | Football Insight" };
const metric = (value: number | null) => value == null ? "—" : value.toFixed(3);
const statusLabel: Record<string, string> = { REVIEW: "Prověřit", WATCH: "Sledovat", PROMISING: "Slibné", LOW_SAMPLE: "Málo dat" };

export default async function ModelGovernancePage() {
  const user = await getCurrentUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();
  const data = await getModelGovernanceDashboard();
  return <main className="page-shell py-6">
    <header className="mb-5">
      <p className="page-kicker">Administrace · Model v{data.modelVersion}</p>
      <h1 className="page-title">Řídicí centrum modelů</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">Co pohlídat, kdy vzniká dostatečný vzorek a které kohorty vyžadují kontrolu. Přehled nic automaticky nepovyšuje ani nepřelaďuje.</p>
      <AdminNav />
    </header>
    <section className="ui-panel p-4"><h2 className="text-lg font-bold">Co řešit</h2>{data.tasks.length ? <div className="mt-3 space-y-2">{data.tasks.map((task, index) => <article key={`${task.title}-${index}`} className="rounded-lg border border-border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{task.title}</strong><span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-bold">{task.priority === "NOW" ? "Nyní" : task.priority === "SOON" ? "Brzy" : "Sledovat"}</span></div><p className="mt-1 text-muted">{task.reason} · {task.due}</p></article>)}</div> : <p className="mt-2 text-sm text-muted">Není splatná mimořádná kontrola. Pokračuje pravidelný sběr.</p>}</section>
    <section className="ui-panel mt-4 p-4"><h2 className="text-lg font-bold">Ochranná 1X2 shadow politika</h2><p className="mt-1 text-sm text-muted">Stejný základ jako 1X2 v2, ale vyžaduje připravenost 7 a rozdíl nad 15 p. b. ponechá pouze k auditu. Turecká liga zůstává zahrnutá.</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Mini label="Celkem" value={data.shadow.total} /><Mini label="Kandidáti" value={data.shadow.candidates} /><Mini label="Jen sledovat" value={data.shadow.watch} /></div></section>
    <section className="ui-panel mt-4 overflow-x-auto p-4"><h2 className="text-lg font-bold">Milníky strategií</h2><table className="mt-3 w-full min-w-[760px] text-left text-sm"><thead className="text-muted"><tr><th>Model</th><th>Stav</th><th>Vzorek</th><th>Další kontrola</th><th>Co rozhodnout</th></tr></thead><tbody>{data.strategies.map((item) => <tr className="border-t border-border" key={`${item.strategy}:${item.policyVersion}`}><td className="py-2 font-semibold">{item.title}</td><td>{item.status}</td><td>{item.sample}/{item.minimumSample}</td><td>{item.nextMilestone ? `n=${item.nextMilestone} (zbývá ${item.remaining})` : "Ruční finální revize"}</td><td className="max-w-md text-xs text-muted">{item.decision}</td></tr>)}</tbody></table></section>
    <section className="ui-panel mt-4 overflow-x-auto p-4"><h2 className="text-lg font-bold">1X2 podle lig</h2><p className="mt-1 text-sm text-muted">Srovnání na totožných uzavřených zápasech. Nižší log-loss je lepší; liga se automaticky nevypíná.</p><table className="mt-3 w-full min-w-[720px] text-left text-sm"><thead className="text-muted"><tr><th>Liga</th><th>n</th><th>Model</th><th>Trh</th><th>Stav</th><th>Nízká připravenost</th></tr></thead><tbody>{data.leagues.map((league) => <tr className="border-t border-border" key={league.leagueId}><td className="py-2 font-semibold">{league.name}</td><td>{league.n}</td><td>{metric(league.modelLogLoss)}</td><td>{metric(league.marketLogLoss)}</td><td>{statusLabel[league.status]}</td><td>{league.lowReadiness}</td></tr>)}</tbody></table></section>
    <section className="ui-panel mt-4 p-4"><h2 className="text-lg font-bold">Kalibrační checkpointy</h2><div className="mt-3 grid gap-3 md:grid-cols-3">{data.checkpoints.map((item) => <article className="rounded-lg border border-border p-3 text-sm" key={`${item.cohort}:${item.modelContext}`}><strong>{item.modelContext}</strong><p className="mt-1">Čeká {item.pendingCount}/5 nových výsledků</p><p className="text-xs text-muted">Vyhodnoceno {item.evaluatedCount} · poslední běh {item.lastRunAt?.toLocaleString("cs-CZ") ?? "zatím neproběhl"}</p></article>)}</div></section>
  </main>;
}

function AdminNav() { return <nav className="mt-3 flex gap-2"><Link className="ui-button ui-button-secondary" href="/provoz">Provoz pipeline</Link><Link className="ui-button ui-button-primary" href="/provoz/modely">Modely</Link></nav>; }
function Mini({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-background p-3"><p className="text-[10px] uppercase text-muted">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>; }
