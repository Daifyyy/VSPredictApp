import type { MatchInsight } from "@/lib/picks/matchInsight";

export type MatchInsightVariant = "summary" | "detail" | "governance";
const verdictLabel = { TREFENO:"Odpovídá", CASTECNE:"Částečně", NETREFENO:"Jiný průběh", NEDOSTATEK_DAT:"Málo dat" } as const;
const pct=(value:number|null|undefined)=>value==null?"—":`${Math.round(value*100)} %`;
const number=(value:number|null|undefined,digits=1)=>value==null?"—":value.toFixed(digits);

export function MatchInsightCard({insight,variant="detail",pro=false}:{insight:MatchInsight;variant?:MatchInsightVariant;pro?:boolean}){
  const summary=insight.publicSummary;
  if(variant==="summary")return <div className="rounded-lg border border-border bg-background px-3 py-2" aria-label="Audit očekávaného průběhu"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-foreground">{summary.title}</strong>{summary.verdict?<span className="rounded-full bg-surface px-2 py-1 text-[10px] font-bold">{verdictLabel[summary.verdict]}</span>:null}</div><p className="mt-1 text-[11px] leading-4 text-muted">{summary.text}</p></div>;
  const expectation=insight.expectation;
  const evaluation=insight.evaluation;
  return <section className="rounded-xl border border-border bg-surface p-3" aria-label="Očekávání a skutečný průběh zápasu">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="page-kicker">{insight.phase==="PREMATCH"?"Očekávaný průběh":insight.phase==="LIVE"?"Očekávání vs. realita":"Jak model trefil průběh"}</p><h3 className="mt-1 text-sm font-bold text-foreground">{summary.title}</h3></div><span className="rounded-full bg-background px-2.5 py-1 text-[10px] font-bold text-muted">Shadow v{insight.pressureVersion} · neovlivňuje tip</span></div>
    <p className="mt-2 text-sm leading-5 text-foreground">{summary.text}</p>
    {summary.strongestMatch||summary.largestMiss?<p className="mt-2 text-xs text-muted">{summary.strongestMatch?`Největší shoda: ${summary.strongestMatch}. `:""}{summary.largestMiss?`Největší odchylka: ${summary.largestMiss}.`:""}</p>:null}
    {!pro?<p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted">PRO zpřístupní číselné očekávání, odchylky a zdroje hodnocení.</p>:null}
    {pro&&expectation?<details className="mt-3 rounded-lg border border-border bg-background" open={variant==="governance"}><summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground">Technické očekávání</summary><div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2"><InsightSide label="Domácí" side={expectation.home}/><InsightSide label="Hosté" side={expectation.away}/><Metric label="Otevřenost" value={`${number(insight.technical?.openness,0)}/100`}/><Metric label="Závislost na slabší straně" value={`${insight.technical?.dependencyRisk.level??"—"} · podíl ${pct(insight.technical?.dependencyRisk.weakerShare)}`}/></div><Legend/></details>:null}
    {pro&&evaluation?<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{evaluation.components.map((component)=><div className="rounded-lg border border-border bg-background px-3 py-2" key={component.key}><div className="flex justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted"><span>{component.label}</span><span>{verdictLabel[component.verdict]}</span></div><p className="mt-1 text-xs leading-5 text-foreground">{component.detail}</p>{component.source?<p className="mt-1 text-[10px] text-muted">Zdroj: {component.source}</p>:null}</div>)}</div>:null}
    {pro?<p className="mt-2 text-[10px] text-muted">Pokrytí {pct(insight.coverage)} · confidence {pct(insight.confidence)}{insight.minute!=null?` · stav v ${insight.minute}. minutě`:""}</p>:null}
  </section>;
}

function InsightSide({label,side}:{label:string;side:NonNullable<MatchInsight["expectation"]>["home"]}){return <div className="rounded-lg border border-border p-2"><strong className="text-xs">{label}</strong><dl className="mt-2 grid grid-cols-2 gap-2"><Datum label="xG" value={number(side.xg.value,2)}/><Datum label="Střely" value={number(side.shots.value)}/><Datum label="Na branku" value={number(side.shotsOnTarget.value)}/><Datum label="Z vápna" value={number(side.shotsInsideBox.value)}/><Datum label="Podíl šancí" value={pct(side.chanceShare.value)}/><Datum label="Držení" value={pct(side.possessionShare.value)}/></dl></div>}
function Datum({label,value}:{label:string;value:string}){return <div><dt className="text-[9px] uppercase tracking-wide text-muted">{label}</dt><dd className="font-semibold tabular-nums text-foreground">{value}</dd></div>}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-border p-2"><span className="text-[9px] uppercase tracking-wide text-muted">{label}</span><strong className="mt-1 block text-xs text-foreground">{value}</strong></div>}
function Legend(){return <div className="sm:col-span-2 rounded-lg border border-border px-3 py-2 text-[11px] leading-5 text-muted"><strong className="text-foreground">Jak čísla číst:</strong> index tlaku je relativní síla matchupu, nikoli procento. Střely vyjadřují objem, xG kombinuje objem a kvalitu šancí, podíl šancí rozděluje očekávané nebezpečí mezi týmy a otevřenost popisuje tempo, nikoli jistotu gólů.</div>}
