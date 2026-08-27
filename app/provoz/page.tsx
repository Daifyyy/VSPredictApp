import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/authUser";
import { isAdminEmail } from "@/lib/entitlements";
import { auditPipeline } from "@/lib/operations";

export const metadata = { title: "Provozní stav | Football Insight" };

const fmt = (value: number) => `${(value * 100).toFixed(1)} %`;

export default async function OperationsPage() {
  const user = await getCurrentUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();
  const health = await auditPipeline();
  return (
    <main className="page-shell py-6">
      <header className="mb-5">
        <p className="page-kicker">Administrace</p>
        <h1 className="page-title">Provoz predikční pipeline</h1>
        <p className="mt-2 text-sm text-muted">Stav k {new Date(health.asOf).toLocaleString("cs-CZ")}. Veřejné stránky tento audit nespouštějí.</p>
      </header>
      <section className="grid gap-3 md:grid-cols-3">
        {health.coverage.map((item) => (
          <article key={item.category} className="ui-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.category.replaceAll("_", " ")}</p>
            <p className="mt-2 text-2xl font-bold">{fmt(item.ratio)}</p>
            <p className="mt-1 text-sm text-muted">{item.covered}/{item.eligible} · cíl {fmt(item.target)}</p>
          </article>
        ))}
      </section>
      <section className="ui-panel mt-4 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">API-Football dnes</p><p className="mt-2 text-2xl font-bold">{health.apiCallsToday} / {health.apiDailyLimit}</p><p className="text-sm text-muted">Měřeno přímo v klientovi API, včetně opakovaných pokusů.</p></section>
      <section className="ui-panel mt-4 p-4">
        <h2 className="text-lg font-bold">Otevřené incidenty</h2>
        {health.incidents.length ? <ul className="mt-3 space-y-2">{health.incidents.map((item) => (
          <li key={item.id} className="rounded-lg border border-border p-3 text-sm"><strong>{item.severity}</strong> · {item.message}</li>
        ))}</ul> : <p className="mt-2 text-sm text-muted">Žádný otevřený incident.</p>}
      </section>
      <section className="ui-panel mt-4 overflow-x-auto p-4">
        <h2 className="text-lg font-bold">Poslední běhy</h2>
        <table className="mt-3 w-full min-w-[760px] text-left text-sm"><thead><tr className="text-muted"><th>Úloha</th><th>Stav</th><th>Začátek</th><th>Zpracováno</th><th>Chyby</th><th>API</th><th>Zbývá</th></tr></thead><tbody>{health.latestRuns.map((run) => (
          <tr key={run.id} className="border-t border-border"><td className="py-2 font-medium">{run.job}</td><td>{run.status}</td><td>{run.startedAt.toLocaleString("cs-CZ")}</td><td>{run.processed}/{run.candidates}</td><td>{run.errors}</td><td>{run.apiCalls}</td><td>{run.remaining}</td></tr>
        ))}</tbody></table>
      </section>
    </main>
  );
}
