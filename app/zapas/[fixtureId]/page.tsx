import { readModelOnlyFixture } from '@/lib/data/modelOnlyStore';
import { ModelForecastCard } from '@/app/_components/ModelForecastCard';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/authUser';
import { isAdminEmail } from '@/lib/entitlements';
import { readMatchDetail } from '@/lib/data/matchDetail';
import { MatchInsightCard } from '@/app/_components/MatchInsightCard';
import { AppHeader } from '@/app/_components/AppHeader';
import { MatchContextDetail } from '@/app/_components/MatchContextDetail';

export const dynamic = 'force-dynamic';
export default async function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const raw = (await params).fixtureId;
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const user = await getCurrentUser();
  let data: Awaited<ReturnType<typeof readMatchDetail>>;
  try { data = await readMatchDetail(id, user?.tier === 'PRO' || isAdminEmail(user?.email)); }
  catch { return <main className="mx-auto max-w-3xl p-6"><Link href="/">← Program</Link><h1 className="mt-4 text-2xl font-bold">Detail není dostupný</h1><p>Uložená data se nepodařilo načíst. Nejde o chybějící predikci ani nulový výsledek.</p></main>; }
  if (!data) return <main className="mx-auto max-w-3xl space-y-4 p-6"><Link href="/">← Program</Link><h1 className="page-title">Predikce není zachycena</h1><p>Pro tento zápas zatím nemáme uložený předzápasový model. Nevytváříme jej dodatečně při otevření detailu.</p><Link href="/vysledky">Konečné výsledky</Link></main>;
  let modelRows:Awaited<ReturnType<typeof readModelOnlyFixture>>|null=null;
  try { modelRows=await readModelOnlyFixture(id,!data.locked); } catch { /* Preserve the main detail during migration/outage. */ }
  const f = data.forecast, pct = (n: number) => `${(n * 100).toFixed(0)} %`;
  return <><AppHeader user={user ? { id: user.id, name: user.name, image: user.image, tier: user.tier, proTrialUsed: user.proTrialUsed, isAdmin: isAdminEmail(user.email) } : null}/><main className="match-page mx-auto max-w-5xl space-y-6 px-4 py-6 pb-24">
    <nav className="flex gap-4 text-sm"><Link prefetch={false} href="/">← Program</Link><Link prefetch={false} href={`/vysledky?date=${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.kickoff))}`}>Výsledky dne</Link><Link prefetch={false} href="/vykonnost">Výkonnost</Link></nav>
    <header className="sport-hero p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>{new Date(data.kickoff).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span className="rounded-full border border-border bg-background px-3 py-1.5">{data.status==='FT'?'Dohráno':data.status==='NS'?'Před zápasem':data.status}</span>
      </div>
      <h1 className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center text-2xl font-extrabold tracking-tight sm:gap-6 sm:text-4xl">
        <span>{data.homeName}<span className="mt-2 block text-[10px] font-medium uppercase tracking-widest text-muted">Domácí</span></span>
        <span className="text-xl tabular-nums text-muted">{data.status==='FT'?`${data.homeGoals??'—'} : ${data.awayGoals??'—'}`:'vs.'}</span>
        <span>{data.awayName}<span className="mt-2 block text-[10px] font-medium uppercase tracking-widest text-muted">Hosté</span></span>
      </h1>
    </header>
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Očekávaný výsledek</h2><span className="text-xs text-muted">Poslední uložený odhad</span></div>
      {data.limitedReason?<p className="text-sm text-muted">Použitelná předzápasová predikce není zachycena.</p>:data.locked?<p className="text-sm text-muted">Číselná predikce je dostupná s PRO.</p>:f&&<>
        <div className="grid grid-cols-3 gap-3">{[['Domácí',f.homeWin],['Remíza',f.draw],['Hosté',f.awayWin]].map(([label,p])=><div key={String(label)} className={`rounded-xl border p-3 text-center sm:p-5 ${p===Math.max(f.homeWin,f.draw,f.awayWin)?'border-home/50 bg-home/10':'border-border bg-background/40'}`}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-extrabold tabular-nums sm:text-3xl">{pct(Number(p))}</p></div>)}</div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-xl bg-surface/60 py-4 text-center"><div><p className="text-xs text-muted">Over 2,5</p><strong className="mt-1 block text-lg tabular-nums">{pct(f.over25)}</strong></div><div><p className="text-xs text-muted">Oba skórují</p><strong className="mt-1 block text-lg tabular-nums">{pct(f.bttsYes)}</strong></div><div><p className="text-xs text-muted">Očekávané góly</p><strong className="mt-1 block text-lg tabular-nums">{f.lambdaHome.toFixed(1)} : {f.lambdaAway.toFixed(1)}</strong></div></div>
        {f.lowConfidence&&<p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-warning">Omezená důvěra v podklady.</p>}
        <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">Zdroj a čas výpočtu</summary><p className="mt-2">Výpočet {new Date(data.asOf).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'})} · model v{f.modelVersion} · {f.modelContext} · kontext {f.contextVersion}. Otevření stránky model nepřepočítává. Tento odhad se může lišit od prvního zmrazeného tipu níže.</p></details>
      </>}
    </section>
    <section className="space-y-4"><div><h2 className="text-lg font-bold">Uložené modelové tipy</h2><p className="mt-1 text-xs text-muted">Neměnné předzápasové odhady · přesnost, nikoli ziskovost</p></div>
      {data.locked?<p className="text-sm text-muted">Konkrétní predikce jsou PRO.</p>:modelRows===null?<p role="status">Evidenci se nepodařilo načíst.</p>:!modelRows.length?<p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">Předzápasové tipy pro tento zápas nebyly zachyceny.</p>:<div className="grid gap-4 md:grid-cols-2">{modelRows.map(r=><ModelForecastCard key={r.id} row={{...r,capturedAt:r.capturedAt.toISOString()}}/>)}</div>}
    </section>
    <MatchContextDetail key={id} fixtureId={id}/>
    <details className="rounded-2xl border border-border p-5"><summary className="cursor-pointer font-bold">Průběh a konečný audit</summary><div className="mt-4 space-y-3">
      {data.flow.insight && <MatchInsightCard insight={data.flow.insight} pro={!data.locked} />}
      {data.flow.reason && <p role="status">{data.flow.reason === 'FLOW_UNAVAILABLE' ? 'Audit průběhu se nepodařilo načíst.' : data.flow.reason === 'FINAL_AUDIT_PENDING' ? 'Konečný audit dosud není uložený. Výše je pouze původní očekávání.' : data.flow.reason === 'AWAITING_FINAL_RESULT' ? 'Čeká na konečné vyhodnocení. Výše zůstává předzápasové očekávání, nikoli živý průběh.' : 'Předzápasový audit průběhu nebyl zachycen.'}</p>}
    </div></details>
    <details className="rounded-2xl border border-border p-5 text-sm"><summary className="cursor-pointer font-bold">Archiv · původní Denní výběr</summary><div className="mt-4 space-y-3">
      <p className="text-sm">Posledních nejvýše 30 položek publikační historie, nikoli všechny predikce a kandidáti. Nepotvrzuje doručení Telegramu.</p>
      {data.locked ? <p>Konkrétní výběry jsou dostupné s PRO.</p> : data.publications.unavailable ? <p role="status">Historii nelze načíst; nejde o nulovou bilanci.</p> : !data.publications.items.length ? <p>Zápas nemá zachycenou položku Denního výběru.</p> : <ul className="space-y-3">{data.publications.items.map(p => <li key={p.id} className="mt-3 border-t border-border pt-3">
        <strong>{p.selection ?? 'Popis výběru nezachycen'}</strong><p>{p.strategy ?? 'Zdroj nezachycen'} · {p.decimalOdds.toFixed(2)} · {p.bookmaker}</p>
        <p>{p.outcome === 'WON' ? '✅ Výhra' : p.outcome === 'LOST' ? '❌ Prohra' : p.outcome === 'VOID' ? '↩️ Void' : '⏳ Čeká na vyhodnocení'}{p.status === 'WITHDRAWN' ? ' · stažený výběr (zůstává v bilanci)' : ''}</p>
        <p>Profit {p.profit == null ? '—' : `${p.profit.toFixed(2)} j`} · CLV {p.priceClv == null ? 'nezachyceno' : `${(p.priceClv * 100).toFixed(2)} %`}</p>
        <p className="text-xs">Publikováno {p.publishedAt.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}</p>
      </li>)}</ul>}
    </div></details>
    <details className="rounded-2xl border border-border p-5 text-sm"><summary className="cursor-pointer font-bold">Archiv · tikety VALUE / ELO</summary><div className="mt-4 space-y-3">
      <p className="text-sm">Uložené nohy tiketů, nikoli nové singly. Výsledek nohy a profit celého tiketu jsou oddělené; nepřičítají se k bilanci Denního výběru. Nejvýše 30 záznamů.</p>
      {data.locked ? <p>Detail tiketů je dostupný s PRO.</p> : data.ticketLegs.unavailable ? <p role="status">Tikety nelze načíst; nejde o nulovou bilanci.</p> : !data.ticketLegs.items.length ? <p>Zápas nemá uloženou nohu VALUE/ELO tiketu.</p> : <ul className="space-y-3">{data.ticketLegs.items.map(leg => <li key={leg.id} className="mt-3 border-t border-border pt-3">
        <strong>{leg.ticket.strategy === 'VALUE' ? 'VALUE' : 'ELO / Intuice'} · {leg.ticket.windowKey} · tiket {leg.ticket.slot}</strong>
        <p>{leg.winnerName} + {leg.totalSide === 'OVER' ? 'více než' : leg.totalSide === 'UNDER' ? 'méně než' : leg.totalSide} {leg.totalLine} gólu</p>
        <p>Kurz nohy {leg.decimalOdds?.toFixed(2) ?? 'nezachycen'} · {leg.bookmaker ?? 'bookmaker nezachycen'} · typ ceny: {leg.priceKind}</p>
        <p>Noha: {!leg.settledAt ? '⏳ Čeká na vyhodnocení' : leg.hit === true ? '✅ Výhra' : leg.hit === false ? '❌ Prohra' : 'Výsledek není jednoznačně zachycen'}</p>
        <p>Celý tiket: {leg.ticket.status} · profit {leg.ticket.profit == null ? '—' : `${leg.ticket.profit.toFixed(2)} j`}</p>
        <p className="text-xs">Policy {leg.ticket.policyVersion} · CLV {leg.priceClv == null ? 'nezachyceno' : `${(leg.priceClv * 100).toFixed(2)} % (${leg.clvMethodVersion === 2 ? 'v2' : 'historická metodika'})`}</p>
      </li>)}</ul>}
    </div></details>
    <p className="text-xs text-muted">Detail čte uložené předzápasové očekávání a konečné vyhodnocení. Živý přenos ani nový modelový výpočet při otevření neprovádí.</p>
  </main></>;
}
