"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { localDateKey } from '@/lib/competitionGrouping';
import { MODEL_SOURCE_LABELS,modelSelectionLabel,accuracyInterval } from '@/lib/picks/modelOnly';
type Forecast={id:string;fixtureId:number;source:string;homeName:string;awayName:string;kickoff:string;capturedAt:string;market:string;side:string;line:number|null;probability:number;qualified:boolean;reason:string;outcome:string;modelVersion:number;modelContext:string};
type Metric={source:string;modelVersion:number;contextVersion:number;modelContext:string;artifactId:string;forecasts:number;qualified:number;evaluated:number;correct:number;selectedEvaluated:number;selectedCorrect:number;pending:number;void:number;baselineAccuracy:number|null;brier:number|null;logLoss:number|null;ece:number|null};
type Payload={date:string;policyVersion:number;asOf:string|null;stale:boolean;limitedReason:string|null;locked:boolean;count:number;status:string;daily:Forecast[];forecasts:Forecast[];hasMore:boolean;summary:{groups:Metric[];daily?:{published:number;evaluated:number;correct:number;pending:number}}|null};
const pct=(v:number|null)=>v==null?'—':`${(100*v).toFixed(1)} %`;
function ForecastCard({row}:{row:Forecast}){return <article className="rounded-xl border border-border p-3 space-y-1">
 <Link className="font-bold underline" href={`/zapas/${row.fixtureId}`}>{row.homeName} – {row.awayName}</Link>
 <p>{modelSelectionLabel(row)} · model {pct(row.probability)}</p>
 <p className="text-xs text-muted">{MODEL_SOURCE_LABELS[row.source]??row.source} · v{row.modelVersion} · {row.modelContext} · {new Date(row.kickoff).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'})}</p>
 <p className="text-sm">{row.outcome==='WON'?'✅ Trefeno':row.outcome==='LOST'?'❌ Netrefeno':row.outcome==='VOID'?'↩ Nehodnoceno':'⏳ Čeká'} · {row.qualified?'Modelový práh splněn':'Pouze predikce, mimo výběr'}</p>
 <details className="text-xs text-muted"><summary>Diagnostika</summary><p>{row.reason} · zachyceno {new Date(row.capturedAt).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'})}. Modelový odhad není garance. Bez cen nehodnotíme výhodnost sázky.</p></details>
 </article>;}
export function ModelOnlyPanel({initialDate,compact=false,identity=''}:{initialDate?:string;compact?:boolean;identity?:string}){
 const [chosenDate,setDate]=useState(initialDate??localDateKey(new Date())),[page,setPage]=useState(0),[source,setSource]=useState('ALL');
 const date=compact?(initialDate??chosenDate):chosenDate;
 const key=`${date}:${page}:${identity}:${source}`;
 const [loaded,setLoaded]=useState<{key:string;data?:Payload;error?:boolean}|null>(null);
 const state=loaded?.key===key?loaded:null,data=state?.data;
 useEffect(()=>{const ctrl=new AbortController();fetch(`/api/picks/model-only?date=${date}&page=${page}${source==='ALL'?'':`&source=${source}`}`,{signal:ctrl.signal}).then(async r=>{if(!r.ok)throw Error('unavailable');return r.json() as Promise<Payload>;}).then(data=>setLoaded({key,data})).catch(()=>{if(!ctrl.signal.aborted)setLoaded({key,error:true});});return()=>ctrl.abort();},[date,page,key,source]);
 return <section className="ui-panel space-y-4 p-4">
 <h2 className="text-xl font-bold">{compact?'Denní modelový výběr':'Modelové predikce a úspěšnost'}</h2>
 <p className="text-sm text-muted">Nová politika 2001 bez kurzů. Měříme přesnost, ne ziskovost. Historické ROI ani CLV se do ní nepřenášejí.</p>
 {!compact&&<div className="flex flex-wrap gap-3"><label>Datum <input type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(0);const url=new URL(location.href);url.searchParams.set('date',e.target.value);history.replaceState(null,'',url);}}/></label><label>Model <select value={source} onChange={e=>{setSource(e.target.value);setPage(0);}}><option value="ALL">Všechny</option>{Object.entries(MODEL_SOURCE_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>}
 {!state?<p>Načítání uloženého výběru a modelových predikcí…</p>:state.error?<p role="alert">Modelová data nejsou dostupná. Může chybět migrace nebo databáze; nejde o nulovou bilanci.</p>:data&&<>
 {data.stale&&<p role="status">Souhrn chybí nebo je starší než 26 hodin. Vyčkej na dokončení predikčního/vyhodnocovacího běhu.</p>}
 {data.asOf&&<p className="text-xs text-muted">Aktualizace {new Date(data.asOf).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'})}</p>}
 {data.locked?<p>Konkrétní predikce jsou dostupné s PRO. Denní výběr: {data.count} položek.</p>:<>
 <h3 className="font-bold">Denní výběr · nejvýše 5 různých zápasů</h3>
 <p className="text-xs text-muted">Řazení podle odhadované pravděpodobnosti, nejvýše dvě položky na ligu. Neověřený selektor; modely nemusí být stejně kalibrované.</p>
 {data.daily.map(r=><ForecastCard key={r.id} row={r}/>)}
 {!data.daily.length&&<p>{data.status==='NOT_ASSEMBLED'?'Výběr zatím nebyl sestaven (od 09:00).':'Žádný výběr; pětici nenaplňujeme za každou cenu.'}</p>}
 {!compact&&<><h3 className="font-bold">Všechny zachycené predikce · stránka {page+1}</h3>{data.forecasts.filter(r=>source==='ALL'||r.source===source).map(r=><ForecastCard key={r.id} row={r}/>)}<div className="flex gap-4"><button disabled={!page} onClick={()=>setPage(page-1)}>Předchozí</button><button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Další</button></div></>}
 </>}
 {!compact&&data.summary?.daily&&<p>Vlastní bilance denního selektoru: {data.summary.daily.correct}/{data.summary.daily.evaluated} trefeno · {pct(data.summary.daily.evaluated?data.summary.daily.correct/data.summary.daily.evaluated:null)} · publikováno {data.summary.daily.published}, čeká {data.summary.daily.pending}. Odděleno od všech kvalifikovaných výběrů.</p>}
 {!compact&&<><h3 className="font-bold">Prospektivní bilance · modelové verze a kontexty odděleně</h3><p className="text-xs text-muted">Pokrytí = kvalifikované / zachycené predikce daného modelu, nikoli všechny zápasy programu. Kalibrace a chyby jsou ze všech vyhodnocených predikcí. Baseline: vždy domácí u 1X2, vždy Over u Overu; kombinace baseline nemá.</p>
 {data.summary?.groups.filter(g=>source==='ALL'||g.source===source).map(g=><article key={[g.source,g.modelVersion,g.contextVersion,g.modelContext,g.artifactId].join(':')} className="rounded-xl border p-3 text-sm"><strong>{MODEL_SOURCE_LABELS[g.source]} · v{g.modelVersion}/{g.contextVersion} · {g.modelContext}</strong><p>Vyhodnocené výběry {g.selectedEvaluated} · trefeno {g.selectedCorrect} · úspěšnost {pct(g.selectedEvaluated?g.selectedCorrect/g.selectedEvaluated:null)}</p><p>Všechny predikce: {g.evaluated}/{g.forecasts} vyhodnoceno · přesnost {pct(g.evaluated?g.correct/g.evaluated:null)} · baseline {pct(g.baselineAccuracy)} · pokrytí {pct(g.forecasts?g.qualified/g.forecasts:null)}</p><p>Brier {g.brier?.toFixed(3)??'—'} · log-loss {g.logLoss?.toFixed(3)??'—'} · top-label ECE {pct(g.ece)} · čeká {g.pending} · nehodnoceno {g.void}</p><p>Orientační 95% Wilsonovo pásmo úspěšnosti: {accuracyInterval(g.selectedCorrect,g.selectedEvaluated)?.map(pct).join(' až ')??'—'}. Nezohledňuje závislost zápasů.</p><p>Vzorek {g.selectedEvaluated<50?'zatím malý':g.selectedEvaluated<200?'průběžný, neprokázaná stabilita':'k ručnímu posouzení'}; žádné automatické schválení.</p></article>)}
 {!data.summary?.groups.length&&<p>Nová kohorta ještě nemá uložené predikce. Staré cenové výsledky zůstaly v archivu.</p>}</>}
 </>}
 {compact&&<Link className="underline" href={`/denni-vyber?date=${date}`}>Otevřít predikce a bilanci</Link>}
 </section>;
}
