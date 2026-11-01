"use client";
import { MODEL_FORECAST_SORTS, type ModelForecastSort } from '@/lib/picks/modelForecastSort';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { localDateKey } from '@/lib/competitionGrouping';
import { MODEL_ONLY_POLICY, MODEL_ONLY_POLICIES } from '@/lib/modelOnlyMode';
import { MODEL_SOURCE_LABELS, accuracyInterval } from '@/lib/picks/modelOnly';
import { ModelForecastCard, type ForecastCardData } from './ModelForecastCard';

type Metric = { source:string; modelVersion:number; contextVersion:number; modelContext:string; artifactId:string; forecasts:number; qualified:number; evaluated:number; correct:number; selectedEvaluated:number; selectedCorrect:number; pending:number; void:number; baselineAccuracy:number|null; brier:number|null; logLoss:number|null; ece:number|null };
type Payload = { date:string; policyVersion:number; asOf:string|null; stale:boolean; limitedReason:string|null; locked:boolean; count:number; status:string; daily:ForecastCardData[]; forecasts:ForecastCardData[]; hasMore:boolean; summary:{groups:Metric[];daily?:{published:number;evaluated:number;correct:number;pending:number}}|null };
const pct = (v:number|null) => v == null ? '—' : `${(100*v).toFixed(1)} %`;
type View = 'daily' | 'qualified' | 'all';
export function ModelOnlyPanel({initialDate, compact=false, identity='',initialView='daily'}:{initialDate?:string;compact?:boolean;identity?:string;initialView?:View}) {
  const [chosenDate,setDate] = useState(initialDate ?? localDateKey(new Date()));
  const [page,setPage] = useState(0), [source,setSource] = useState('ALL');
  const [view,setView] = useState<View>(initialView), [policy,setPolicy] = useState(MODEL_ONLY_POLICY);
  const [sort,setSort] = useState<ModelForecastSort>('probability_desc');
  const date = compact ? (initialDate ?? chosenDate) : chosenDate;
  const key = `${date}:${page}:${identity}:${source}:${view}:${policy}:${sort}`;
  const [loaded,setLoaded] = useState<{key:string;data?:Payload;error?:boolean}|null>(null);
  const state = loaded?.key === key ? loaded : null, data = state?.data;
  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({date,page:String(page),policy:String(policy),sort});
    if(source!=='ALL')params.set('source',source);
    if(view==='qualified')params.set('qualified','1');
    fetch(`/api/picks/model-only?${params}`,{signal:ctrl.signal})
      .then(async r=>{if(!r.ok)throw Error('unavailable');return r.json() as Promise<Payload>;})
      .then(data=>setLoaded({key,data})).catch(()=>{if(!ctrl.signal.aborted)setLoaded({key,error:true});});
    return ()=>ctrl.abort();
  },[date,page,key,source,view,policy,sort]);
  const matchesSource = (s:string) => source==='ALL' || (source==='TEAM_GOALS' ? s.startsWith('TEAM_') : s===source);
  const rows = (view==='daily'||compact ? data?.daily.filter(r=>matchesSource(r.source)) : data?.forecasts) ?? [];
  const daily = data?.summary?.daily;
  return <section className="mt-6 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="page-kicker">Před zápasem · bez kurzů</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight">{compact?'Denní modelový výběr':'Predikce a výsledky'}</h2><p className="mt-2 text-sm text-muted">Doporučení od 60 % · modelový odhad, nikoli jistota.</p></div>
      <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold">Pravidla {policy}</span>
    </header>
    {!compact && <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4 rounded-2xl border border-border bg-surface/60 p-4">
      <label className="grid min-w-0 gap-2 text-xs font-semibold text-muted">Datum<input className="h-12 w-full min-w-0 max-w-full rounded-lg border border-border bg-background pl-3 pr-8 text-sm text-foreground" type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(0);const url=new URL(location.href);url.searchParams.set('date',e.target.value);history.replaceState(null,'',url);}}/></label>
      <label className="grid min-w-0 gap-2 text-xs font-semibold text-muted">Model<select className="h-12 w-full min-w-0 max-w-full truncate rounded-lg border border-border bg-background pl-3 pr-8 text-sm text-foreground" value={source} onChange={e=>{setSource(e.target.value);setPage(0);}}><option value="ALL">Všechny modely</option><option value="TEAM_GOALS">Týmové góly · všechny</option>{Object.entries(MODEL_SOURCE_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label className="grid min-w-0 gap-2 text-xs font-semibold text-muted">Verze<select className="h-12 w-full min-w-0 max-w-full rounded-lg border border-border bg-background pl-3 pr-8 text-sm text-foreground" value={policy} onChange={e=>{setPolicy(Number(e.target.value));setPage(0);}}><option value={MODEL_ONLY_POLICY}>Aktuální · {MODEL_ONLY_POLICY}</option>{MODEL_ONLY_POLICIES.filter(v=>v!==MODEL_ONLY_POLICY).map(v=><option key={v} value={v}>Archiv · {v}</option>)}</select></label>
      <label className="grid min-w-0 gap-2 text-xs font-semibold text-muted">Řazení<select className="h-12 w-full min-w-0 max-w-full rounded-lg border border-border bg-background pl-3 pr-8 text-sm text-foreground disabled:opacity-50" value={sort} disabled={view==='daily'} onChange={e=>{setSort(e.target.value as ModelForecastSort);setPage(0);}}>{Object.entries(MODEL_FORECAST_SORTS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    </div>}
    {!compact && <nav aria-label="Rozsah predikcí" className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1">{([['daily','Vybrané · max. 5'],['qualified','Všechny kvalifikované'],['all','Všechny predikce']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>{setView(id);setPage(0);}} className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold transition-colors ${view===id?'bg-accent text-accent-ink shadow-sm':'text-muted hover:text-foreground'}`}>{label}</button>)}</nav>}
    {!state ? <p className="rounded-xl bg-surface p-4 text-sm text-muted">Načítání uloženého výběru a modelových predikcí…</p> : state.error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-500/5 p-4 text-sm">Modelová data nejsou dostupná. Nejde o nulovou bilanci.</p> : data && <>
      {data.stale && <p role="status" className="rounded-xl border border-amber-300 bg-amber-500/5 px-4 py-3 text-xs">Souhrn není aktuální. Čeká na obnovu po výpočtu nebo vyhodnocení.</p>}
      {!compact&&view==='all'&&<p className="text-xs text-muted">Tento seznam zahrnuje i odhady pod 60 %. Nejde o doporučení; kvalifikované tipy najdeš v samostatné záložce.</p>}
      {policy!==MODEL_ONLY_POLICY&&<p className="text-xs text-muted">Archiv původních pravidel; historické výběry mohou být pod 60 %.</p>}
      {data.locked ? <p className="rounded-2xl border border-border p-6">Konkrétní predikce jsou dostupné s PRO · {data.count} denních výběrů.</p> : <>
        {(view==='daily'||compact)&&<p className="text-xs text-muted">Původní publikační pořadí · nejvýše jeden tip na zápas a dva na ligu. Výběr není statisticky ověřený.</p>}
        <div className="grid gap-4 md:grid-cols-2">{rows.map(row=><ModelForecastCard key={row.id} row={row}/>)}</div>
        {!rows.length && <div className="rounded-2xl border border-dashed border-border p-8 text-center"><strong className="block">Žádné položky pro tento filtr</strong><p className="mt-2 text-sm text-muted">{view==='daily'&&data.status==='NOT_ASSEMBLED'?'Denní výběr se sestavuje od 09:00.':'Podmínky neuvolňujeme kvůli naplnění seznamu.'}</p></div>}
        {!compact&&view!=='daily'&&<div className="flex items-center justify-between"><button className="ui-button-secondary min-h-11 px-4 disabled:opacity-40" disabled={!page} onClick={()=>setPage(page-1)}>← Předchozí</button><span className="text-xs text-muted">Strana {page+1}</span><button className="ui-button-secondary min-h-11 px-4 disabled:opacity-40" disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Další →</button></div>}
      </>}
      {!compact && <>
        <div className="border-t border-border pt-6"><h3 className="text-lg font-bold">Jak si vedeme</h3><p className="mt-1 text-xs text-muted">Celá historie zvolené verze, nikoli pouze vybraný den.</p></div>
        {daily && <div className="grid grid-cols-3 gap-3 rounded-2xl bg-surface p-4"><Stat label="Úspěšnost denního výběru" value={pct(daily.evaluated?daily.correct/daily.evaluated:null)}/><Stat label="Trefeno / vyhodnoceno" value={`${daily.correct} / ${daily.evaluated}`}/><Stat label="Čeká na výsledek" value={String(daily.pending)}/></div>}
        <div className="grid gap-4 md:grid-cols-2">{data.summary?.groups.filter(g=>matchesSource(g.source)).map(g=><article key={[g.source,g.modelVersion,g.contextVersion,g.modelContext,g.artifactId].join(':')} className="rounded-2xl border border-border bg-background p-4">
          <h4 className="text-sm font-bold">{MODEL_SOURCE_LABELS[g.source]??g.source}</h4><p className="mt-1 text-xs text-muted">v{g.modelVersion}/{g.contextVersion} · {g.modelContext} · {g.selectedEvaluated<50?'Malý vzorek':g.selectedEvaluated<200?'Průběžné výsledky':'K ručnímu posouzení'}</p>
          <div className="mt-4 grid grid-cols-2 gap-4"><Stat label="Úspěšnost kvalifikovaných" value={pct(g.selectedEvaluated?g.selectedCorrect/g.selectedEvaluated:null)}/><Stat label="Trefeno / vyhodnoceno" value={`${g.selectedCorrect} / ${g.selectedEvaluated}`}/></div>
          <details className="mt-4 border-t border-border pt-3 text-xs text-muted"><summary className="cursor-pointer">Kalibrace a úplná bilance</summary><dl className="mt-3 grid grid-cols-2 gap-2"><dt>Všechny vyhodnocené</dt><dd>{g.evaluated} / {g.forecasts}</dd><dt>Přesnost všech</dt><dd>{pct(g.evaluated?g.correct/g.evaluated:null)}</dd><dt>Baseline</dt><dd>{pct(g.baselineAccuracy)}</dd><dt>Podíl kvalifikovaných</dt><dd>{pct(g.forecasts?g.qualified/g.forecasts:null)}</dd><dt>Brier / log-loss</dt><dd>{g.brier?.toFixed(3)??'—'} / {g.logLoss?.toFixed(3)??'—'}</dd><dt>ECE</dt><dd>{pct(g.ece)}</dd><dt>Čeká / nehodnoceno</dt><dd>{g.pending} / {g.void}</dd></dl><p className="mt-3">Orientační 95% pásmo: {accuracyInterval(g.selectedCorrect,g.selectedEvaluated)?.map(pct).join(' až ')??'—'}. Nezohledňuje závislost zápasů. Modelové verze se neslučují.</p></details>
        </article>)}</div>
        {!data.summary?.groups.length && <p className="text-sm text-muted">Tato verze zatím nemá uloženou bilanci.</p>}
      </>}
      {data.asOf&&<p className="text-xs text-muted">Aktualizace souhrnu {new Date(data.asOf).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'})}</p>}
    </>}
    {compact&&<Link className="ui-button-primary inline-flex min-h-11 items-center px-5" href={`/denni-vyber?date=${date}`}>Všechny predikce a výsledky →</Link>}
  </section>;
}
function Stat({label,value}:{label:string;value:string}) { return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-extrabold tabular-nums tracking-tight">{value}</p></div>; }
