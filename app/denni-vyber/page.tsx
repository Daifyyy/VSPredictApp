import Link from "next/link";
import { notFound } from "next/navigation";
import { dailySelectionConfig } from "@/lib/dailySelectionConfig";
import { readDailySelection, type DailyPublicationCandidate } from "@/lib/data/dailySelectionStore";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { localDateKey } from "@/lib/competitionGrouping";
import { isDateKey } from "@/lib/picks/strategyHub";
import { AppHeader } from "../_components/AppHeader";
import type { DailyBalance } from "@/lib/picks/dailySelectionSettlement";

export const dynamic = "force-dynamic";
export const metadata = {title:"Denní výběr — Football Insight"};
export default async function DailySelectionPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const user=await getCurrentUser();
  if (!dailySelectionConfig().ui) return <div className="app-page"><AppHeader user={user}/><main className="mx-auto max-w-5xl p-6"><h1 className="page-title">Denní výběr</h1><p className="mt-4">Připravujeme nejvýše pět samostatných sázek napříč strategiemi. Publikování zatím není zapnuté.</p><Link className="mt-4 block underline" href="/strategie">Prohlédnout strategie</Link></main></div>;
  const today=localDateKey(new Date());
  const date=(await searchParams).date??today;
  if (!isDateKey(date)||date>today) notFound();
  const data=await readDailySelection(date,getEntitlement(user).pro);
  const balance=data.balance as {asOf:string;byTier:Record<string,DailyBalance>}|null;
  const rejections=(data.summary as {rejections?:Record<string,number>}).rejections??{};
  const reasonLabels:Record<string,string>={STALE_OR_INVALID_PRICE:"Staré nebo neplatné ceny",MISSING_COMPARABLE_QUOTE:"Chybí úplný přímý trh",NO_DIRECT_MARKET:"Chybí přímá cena",ODDS_OUT_OF_RANGE:"Kurz mimo povolené pásmo",KICKOFF_TOO_CLOSE:"Výkop je příliš blízko",SOURCE_BLOCKED:"Zdroj blokovaný datovým varováním",SOURCE_NOT_QUALIFIED:"Zdrojový filtr nesplněn",CURRENT_PRICE_SOURCE_REJECTED:"Aktuální cena již neprošla zdrojovým filtrem",MISSING_FROZEN_IDENTITY:"Chybí zmrazená identita zápasu",NOT_IN_SOURCE_SHORTLIST:"Mimo kvalifikovaný zdrojový výběr",RESEARCH_DISABLED:"Výzkumný zdroj je vypnutý",MISSING_FIXTURE:"Chybí podklad zápasu"};
  return <div className="app-page"><AppHeader user={user}/><main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <header><p className="page-kicker">Nejvýše pět singlů · politika {data.policyVersion}</p><h1 className="page-title">Denní výběr</h1>
      <p className="mt-3 text-sm text-muted">Krátký výběr napříč strategiemi. Selektor je zatím neověřený; ani doložená zdrojová strategie nezaručuje výhru.</p></header>
    <form className="flex flex-wrap items-end gap-3"><label className="text-sm">Herní den<input className="ml-3 rounded-lg border p-2" name="date" type="date" max={today} defaultValue={date}/></label><button className="rounded-lg border px-4 py-2">Zobrazit</button></form>
    {data.locked && <p className="rounded-xl border p-5">Konkrétní výběry a ceny jsou dostupné uživatelům PRO.</p>}
    {data.emptyReason&&<div className="rounded-xl border bg-background p-4 text-sm"><p>{data.status==="NOT_ASSEMBLED"?"Výběr zatím nebyl sestaven. Ranní sestavení začíná v 09:00 českého času.":"Z dostupných kvalifikovaných zdrojů nyní nic nesplnilo podmínky Denního výběru. Volná místa může doplnit další sběr; pětici nenaplňujeme za každou cenu."}</p>{Object.entries(rejections).map(([reason,count])=><p key={reason} className="mt-1 text-xs text-muted">{reasonLabels[reason]??reason}: {count}</p>)}</div>}
    {(["DOCUMENTED_SOURCE","UNVERIFIED"] as const).map(tier=><section key={tier} className="rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-bold">{tier==="DOCUMENTED_SOURCE"?"Z doložených strategií":"Neověření kandidáti"}</h2>
      <p className="mt-2 text-sm">Pro tento den: {tier==="DOCUMENTED_SOURCE"?data.counts.documented:data.counts.unverified} výběrů</p>
      {balance?.byTier[tier]&&<div className="my-4 grid grid-cols-2 gap-3 rounded-xl bg-background p-4 text-sm sm:grid-cols-4">
        <p>Uzavřeno <strong className="block">{balance.byTier[tier].won+balance.byTier[tier].lost}</strong></p>
        <p>Profit <strong className="block">{balance.byTier[tier].profit.toFixed(2)} j</strong></p>
        <p>ROI <strong className="block">{balance.byTier[tier].roi==null?"—":`${(balance.byTier[tier].roi!*100).toFixed(1)} %`}</strong></p>
        <p>Čeká / vráceno <strong className="block">{balance.byTier[tier].pending} / {balance.byTier[tier].void}</strong></p>
        <p className="col-span-2 text-xs text-muted sm:col-span-4">Vlastní prospektivní bilance policy {data.policyVersion}, 1 jednotka na výběr. Nevyhodnotitelné: {balance.byTier[tier].unevaluable}. Aktualizace {new Date(balance.asOf).toLocaleString("cs-CZ",{timeZone:"Europe/Prague"})}.</p>
      </div>}
      <p className="mt-1 text-sm text-muted">{tier==="DOCUMENTED_SOURCE"?"Zdroj má doložené výsledky a schválenou verzi. Denní výběr má vlastní bilanci.":"Tyto příležitosti zatím nemají dostatečně doloženou výhodu proti trhu."}</p>
      {!data.locked && data.items.filter(i=>i.tier===tier).length===0 && <p className="py-6 text-sm">{data.status==="NOT_ASSEMBLED"?"Výběr pro tento den zatím nebyl sestaven.":"Pro tuto úroveň zatím nebyla publikována žádná příležitost."}</p>}
      {data.items.filter(i=>i.tier===tier).map(item=>{
        const s=item.snapshot as unknown as DailyPublicationCandidate;
        const href=`/porovnani?${new URLSearchParams({mode:"CLUB",homeLeague:String(item.leagueId),awayLeague:String(item.leagueId),home:String(s.homeTeamId),away:String(s.awayTeamId),fixture:String(item.fixtureId)})}`;
        return <article key={item.id} className="mt-5 border-t pt-4">
          <div className="flex justify-between gap-4"><Link className="font-bold underline-offset-4 hover:underline" href={href}>{s.homeName} – {s.awayName}</Link><span className="font-bold">{item.decimalOdds.toFixed(2)}</span></div>
          <p className="mt-2 font-semibold">{s.selection}</p><p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat("cs-CZ",{timeZone:"Europe/Prague",hour:"2-digit",minute:"2-digit"}).format(item.kickoff)} · {s.strategy} · {item.bookmaker}</p>
          <p className="mt-2 text-sm">{{PENDING:"⏳ Čeká",WON:"✅ Vyhráno",LOST:"❌ Prohráno",VOID:"↩ Vráceno",UNEVALUABLE:"⚠ Nevyhodnotitelné"}[item.outcome]??item.outcome}{item.status!=="ACTIVE"?" · staženo z nabídky (zůstává v bilanci)":""}</p>
          <p className="mt-3 text-sm">{s.reason}</p><p className="mt-1 text-sm text-muted">Riziko: {s.risk}</p>
          <details className="mt-3 text-xs text-muted"><summary>Čas ceny a diagnostika</summary><p className="mt-2">Cena zachycena {item.quotedAt.toISOString()} · publikováno {item.publishedAt.toISOString()}</p><p>Stav: {item.status} · výsledek: {item.outcome}</p><p>{s.warnings.join(" · ")}</p></details>
          <details className="mt-2 text-xs text-muted"><summary>Proč toto pořadí a historie změn</summary><p>Důkazy stejné verze → úplnost dat → pásmo tržní pravděpodobnosti → srovnatelný model → čerstvost ceny. EV ani výše kurzu pořadí nemaximalizují.</p><p>Zdrojový vzorek: {s.evidence?.settledPriced??0}. Tržní pravděpodobnost: {s.marketProbability==null?"chybí srovnatelný benchmark":`${Math.round(s.marketProbability*100)} %`}. Price CLV: {item.priceClv==null?"nedostupné":`${(item.priceClv*100).toFixed(1)} %`}.</p>{item.events.map(e=><p key={e.id}>{e.createdAt.toLocaleString("cs-CZ",{timeZone:"Europe/Prague"})} · {e.kind}{e.kind==="WARNING"?` · ${(e.payload as {reason?:string}).reason??""}`:""}</p>)}</details>
        </article>;
      })}
    </section>)}
    <Link className="text-sm underline" href="/strategie">Všechny strategie a jejich bilance</Link>
  </main></div>;
}
