import type { evaluatePressurePerformance } from "@/lib/picks/pressurePerformance";

export type PressurePerformanceReport = ReturnType<typeof evaluatePressurePerformance> & { asOf: string; collectionEnabled: boolean; opportunitiesEnabled: boolean };
const labels: Record<string, string> = { OVER_25: "Over 2,5", BTTS_YES: "BTTS ano", TEAM_HOME_05: "Domácí nad 0,5", TEAM_HOME_15: "Domácí nad 1,5", TEAM_AWAY_05: "Hosté nad 0,5", TEAM_AWAY_15: "Hosté nad 1,5" };
const number = (value: number | null) => value == null ? "—" : value.toFixed(3);

export function PressurePerformanceOverview({ report, context }: { report: PressurePerformanceReport | null; context: string }) {
  const cohorts = report?.cohorts.filter(row => row.context === context) ?? [];
  return <section className="mt-5 rounded-xl border border-border bg-background p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Přesnost predikcí · Průběh v5</h3><span className="rounded-full bg-warning/10 px-3 py-1 text-xs text-warning">Výzkum · {report ? report.collectionEnabled ? "sběr zapnutý" : "sběr pozastavený" : "čeká na souhrn"}</span></div>
    <p className="mt-2 text-xs leading-5 text-muted">Hodnotíme všechny zachycené předzápasové predikce, nejen vybrané sázky. Nižší log-loss a Brier znamenají lepší odhad pravděpodobností; nejde o ROI.</p>
    {!cohorts.length && <p className="mt-3 text-sm">{report ? "Pro tento kontext zatím nejsou vyhodnotitelné v5 snapshoty." : "Souhrn připraví auditní běh. Chybějící souhrn neznamená nulový počet predikcí."}</p>}
    {cohorts.map(cohort => <div key={cohort.artifactVersion} className="mt-4">
      <p className="text-sm font-semibold">Artefakt {cohort.artifactVersion} · {cohort.captured} zachyceno · {cohort.settled} dokončeno · {cohort.captured - cohort.settled} dosud nevyhodnoceno</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[610px] text-left text-xs"><thead className="text-muted"><tr><th className="py-2">Trh</th><th>n v5</th><th>Log-loss v5</th><th>Brier v5</th><th>Společné n</th><th>v5 / hlavní · log-loss</th></tr></thead>
        <tbody>{Object.entries(cohort.markets).map(([market, values]) => <tr key={market} className="border-t border-border"><td className="py-2 font-medium">{labels[market] ?? market}</td><td>{values.candidate.n}</td><td>{number(values.candidate.logLoss)}</td><td>{number(values.candidate.brier)}</td><td>{values.baseline.n}</td><td>{values.baseline.n ? `${number(values.pairedCandidate.logLoss)} / ${number(values.baseline.logLoss)}` : "Chybí zmrazený benchmark"}</td></tr>)}</tbody>
      </table></div>
      <p className="mt-2 text-[11px] leading-5 text-muted">Srovnání vpravo používá pouze stejné zápasy. Starší chybějící pravděpodobnosti hlavního modelu se zpětně nevyrábějí. {cohort.settled < 200 ? `Průběžný vzorek; další kontrola při ${cohort.settled < 50 ? 50 : cohort.settled < 100 ? 100 : 200} zápasech.` : "Vzorek je připraven k ručnímu posouzení; model se automaticky nepovyšuje."}</p>
    </div>)}
    {report && <p className="mt-3 text-[10px] text-muted">Stav dat: {new Date(report.asOf).toLocaleString("cs-CZ")} · {report.opportunitiesEnabled ? "Kvalifikované research sázky mají oddělenou bilanci níže." : "Tvorba research sázek je vypnutá; sběr predikcí na ní nezávisí."}</p>}
  </section>;
}
