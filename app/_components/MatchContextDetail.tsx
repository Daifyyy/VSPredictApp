"use client";
import { useState } from 'react';
import type { MatchContextSnapshot, TeamMatchContext, ContextMetric } from '@/lib/picks/matchContext';
import { CONTEXT_METRICS } from '@/lib/picks/matchContext';
const labels: Record<ContextMetric,string> = { GOALS_FOR:'Góly', GOALS_AGAINST:'Inkasované góly', XG:'Vytvořené xG', XG_AGAINST:'Dovolené xG', SHOTS:'Střely', SHOTS_AGAINST:'Dovolené střely', SHOTS_ON_TARGET:'Na branku', SHOTS_ON_TARGET_AGAINST:'Dovolené na branku', SHOTS_INSIDE_BOX:'Střely z vápna', CORNERS:'Rohy', FOULS:'Fauly', YELLOW_CARDS:'Žluté karty', POSSESSION:'Držení (%)' };
const date = (value: string) => new Date(value).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'});
function TeamContext({ team }: { team: TeamMatchContext }) {
  return <section className="min-w-0 space-y-3 rounded-xl border border-border p-3">
    <h3 className="font-bold">{team.name}</h3><p className="text-xs text-muted">Posledních {team.sample} dostupných soutěžních zápasů. {team.latest ? `Nejnovější: ${date(team.latest)}.` : 'Historie chybí.'} Odpočinek od posledního zachyceného zápasu: {team.restDays == null ? 'nezachycen' : `${team.restDays.toFixed(1)} dne`}.</p>
    <table className="w-full text-xs"><caption className="text-left py-2">Průměry na zápas; v závorce počet dostupných hodnot</caption><thead><tr><th className="text-left">Metrika</th><th>Celkem</th><th>{team.venueLabel === 'HOME' ? 'Doma' : 'Venku'}</th></tr></thead><tbody>{CONTEXT_METRICS.map(key=><tr key={key} className="border-t border-border"><th className="py-1 text-left font-normal">{labels[key]}</th>{[team.overall,team.venue].map((summary,i)=><td key={i} className="text-center">{summary.metrics[key].value == null ? '—' : `${summary.metrics[key].value.toFixed(2)} (${summary.metrics[key].sample})`}</td>)}</tr>)}</tbody></table>
    <h4 className="font-semibold">Historické formace · pouze kontext</h4>
    <p className="text-sm">Nejčastější: {team.tactics.primary ?? 'nezachycena'}. {team.tactics.stability == null ? '' : `Podíl ${Math.round(team.tactics.stability*100)} % z ${team.tactics.sample} známých formací.`}</p>
    <p className="text-xs text-muted">{team.tactics.formations.map(f=>`${f.name}: ${f.count}×`).join(' · ') || 'Sestavy nejsou k dispozici.'} Není to potvrzená sestava tohoto zápasu.</p>
    <h4 className="font-semibold">Kontinuita trenéra · pouze kontext</h4>
    <p className="text-sm">{team.tactics.coach ? `${team.tactics.coach.name}: ${team.tactics.coach.observed} z ${team.tactics.coach.comparable} známých pozorování; posledních ${team.tactics.coach.consecutive} zápasů se stejným trenérem bez mezery v datech.` : 'Trenér v nejnovějším zápase není doložen.'}</p>
    <p className="text-xs text-muted">Nejde o ověřené datum nástupu ani délku působení. Chybějící zápasy mohou kontinuitu omezit.</p>
    <h4 className="font-semibold">Poslední výsledky</h4><ul className="text-xs">{team.recent.map(row=><li key={row.fixtureId}>{date(row.date)} · {row.home?'doma':'venku'} · {row.opponent ?? 'soupeř nezachycen'} · {row.goalsFor}:{row.goalsAgainst}</li>)}</ul>
  </section>;
}
type Payload = { locked: boolean; context: MatchContextSnapshot | null; reason: string | null };
export function MatchContextDetail({ fixtureId }: { fixtureId: number }) {
  const [open,setOpen]=useState(false), [loading,setLoading]=useState(false);
  const [data,setData]=useState<Payload|null>(null), [error,setError]=useState(false);
  async function load() {
    setOpen(true); if(data || loading) return; setLoading(true); setError(false);
    try { const response=await fetch(`/api/predictions/context?fixture=${fixtureId}`); if(!response.ok) throw Error('unavailable'); setData(await response.json()); }
    catch { setError(true); } finally { setLoading(false); }
  }
  const ctx=data?.context;
  return <section className="ui-panel p-4 space-y-3">
    <button type="button" className="font-bold" aria-expanded={open} onClick={()=>open?setOpen(false):void load()}>{open?'▾':'▸'} Podklady predikce: forma, statistiky a taktika</button>
    {open && <>{loading ? <p>Načítání uloženého kontextu…</p> : error ? <p role="status">Podklady se nepodařilo načíst. <button onClick={()=>void load()} className="underline">Zkusit znovu</button></p> : data?.locked ? <p>Podrobné podklady jsou dostupné s PRO.</p> : !ctx ? <p>Předzápasový kontext nebyl zachycen. Ze současných statistik jej zpětně nevytváříme.</p> : <>
      <p className="text-sm">Zmrazeno {date(ctx.capturedAt)} · {ctx.context}. První zachycený kontext se nepřepisuje; pozdější predikční běh může mít jiné pravděpodobnosti.</p>
      <p className="text-sm">Model v{ctx.model.version}: původní λ {ctx.model.lambdaHome.toFixed(2)} : {ctx.model.lambdaAway.toFixed(2)} · Over 2,5 {Math.round(ctx.model.over25*100)} %. Zdroj síly: {ctx.model.strengthSource === 'opponent_adjusted_rating' ? 'rating s korekcí na soupeře' : 'výkonová okna (fallback)'}.</p>
      <p className="text-xs text-muted">Tabulka je popis historie, nikoli přesná vážená matice modelu. Formace a trenér jsou pouze kontext a nemění tipy. Výzkumný tlak je zvlášť označený shadow. Přátelské zápasy a záznamy po zachycení jsou vyloučené; pokrytí nemusí zahrnovat celý program týmu.</p>
      <div className="grid gap-4 md:grid-cols-2"><TeamContext team={ctx.home}/><TeamContext team={ctx.away}/></div>
      <p className="text-sm">Rozhodčí: {ctx.referee.name ?? 'nezachycen'} · faktor pro karetní model {ctx.referee.factor?.toFixed(2) ?? 'nezachycen'} · vzorek {ctx.referee.sample ?? 'nezachycen'}.</p>
      <p className="text-xs text-muted">Potvrzené sestavy a absence zde nejsou zachyceny; jejich pozastavený sběr neobnovujeme. Přestupové přehledy byly ukončeny.</p>
    </>}</>}
  </section>;
}
