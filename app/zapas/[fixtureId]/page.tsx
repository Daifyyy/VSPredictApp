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
  const f = data.forecast, pct = (n: number) => `${(n * 100).toFixed(0)} %`;
  return <><AppHeader user={user ? { id: user.id, name: user.name, image: user.image, tier: user.tier, proTrialUsed: user.proTrialUsed, isAdmin: isAdminEmail(user.email) } : null}/><main className="mx-auto max-w-3xl space-y-4 p-6 pb-24">
    <nav className="flex gap-4 text-sm"><Link prefetch={false} href="/">← Program</Link><Link prefetch={false} href={`/vysledky?date=${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.kickoff))}`}>Výsledky dne</Link><Link prefetch={false} href="/vykonnost">Výkonnost</Link></nav>
    <h1 className="text-2xl font-bold">{data.homeName} – {data.awayName}</h1>
    <p>{new Date(data.kickoff).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })} · {data.status}</p>
    <p>{['FT', 'AET', 'PEN'].includes(data.status) ? `Konečné skóre základní doby: ${data.homeGoals ?? '—'} : ${data.awayGoals ?? '—'}` : 'Konečný výsledek dosud není vyhodnocen. Živý přenos neposkytujeme.'}</p>
    <section className="ui-panel p-4"><h2 className="font-bold">Uložená předzápasová predikce</h2>
      <p className="text-sm">Výpočet z {new Date(data.asOf).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}. Otevření stránky model nepřepočítává. Nejde o doporučení k sázce ani identifikaci původně publikovaného tipu.</p>
      {data.limitedReason ? <p>Použitelná předzápasová predikce není zachycena.</p> : data.locked ? <p>Číselná predikce je dostupná s PRO.</p> : f && <>
        <p className="mt-3">Domácí {pct(f.homeWin)} · remíza {pct(f.draw)} · hosté {pct(f.awayWin)}</p>
        <p>Over 2,5 {pct(f.over25)} · oba skórují {pct(f.bttsYes)}</p>
        <p>Očekávané góly {f.lambdaHome.toFixed(2)} : {f.lambdaAway.toFixed(2)}</p>
        <p className="text-xs">Model {f.modelVersion} · {f.modelContext} · kontext {f.contextVersion}</p>
        {f.lowConfidence && <p>Model označuje omezenou důvěru v podklady.</p>}
      </>}
    </section>
    <MatchContextDetail key={id} fixtureId={id}/>
    <section className="space-y-2">
      {data.flow.insight && <MatchInsightCard insight={data.flow.insight} pro={!data.locked} />}
      {data.flow.reason && <p role="status">{data.flow.reason === 'FLOW_UNAVAILABLE' ? 'Audit průběhu se nepodařilo načíst.' : data.flow.reason === 'FINAL_AUDIT_PENDING' ? 'Konečný audit dosud není uložený. Výše je pouze původní očekávání.' : data.flow.reason === 'AWAITING_FINAL_RESULT' ? 'Čeká na konečné vyhodnocení. Výše zůstává předzápasové očekávání, nikoli živý průběh.' : 'Předzápasový audit průběhu nebyl zachycen.'}</p>}
    </section>
    <section className="ui-panel p-4"><h2 className="font-bold">Publikovaný Denní výběr</h2>
      <p className="text-sm">Posledních nejvýše 30 položek publikační historie, nikoli všechny predikce a kandidáti. Nepotvrzuje doručení Telegramu.</p>
      {data.locked ? <p>Konkrétní výběry jsou dostupné s PRO.</p> : data.publications.unavailable ? <p role="status">Historii nelze načíst; nejde o nulovou bilanci.</p> : !data.publications.items.length ? <p>Zápas nemá zachycenou položku Denního výběru.</p> : <ul className="space-y-3">{data.publications.items.map(p => <li key={p.id} className="mt-3 border-t border-border pt-3">
        <strong>{p.selection ?? 'Popis výběru nezachycen'}</strong><p>{p.strategy ?? 'Zdroj nezachycen'} · {p.decimalOdds.toFixed(2)} · {p.bookmaker}</p>
        <p>{p.outcome === 'WON' ? '✅ Výhra' : p.outcome === 'LOST' ? '❌ Prohra' : p.outcome === 'VOID' ? '↩️ Void' : '⏳ Čeká na vyhodnocení'}{p.status === 'WITHDRAWN' ? ' · stažený výběr (zůstává v bilanci)' : ''}</p>
        <p>Profit {p.profit == null ? '—' : `${p.profit.toFixed(2)} j`} · CLV {p.priceClv == null ? 'nezachyceno' : `${(p.priceClv * 100).toFixed(2)} %`}</p>
        <p className="text-xs">Publikováno {p.publishedAt.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}</p>
      </li>)}</ul>}
    </section>
    <section className="ui-panel p-4"><h2 className="font-bold">Zápas v tiketech VALUE / ELO</h2>
      <p className="text-sm">Uložené nohy tiketů, nikoli nové singly. Výsledek nohy a profit celého tiketu jsou oddělené; nepřičítají se k bilanci Denního výběru. Nejvýše 30 záznamů.</p>
      {data.locked ? <p>Detail tiketů je dostupný s PRO.</p> : data.ticketLegs.unavailable ? <p role="status">Tikety nelze načíst; nejde o nulovou bilanci.</p> : !data.ticketLegs.items.length ? <p>Zápas nemá uloženou nohu VALUE/ELO tiketu.</p> : <ul className="space-y-3">{data.ticketLegs.items.map(leg => <li key={leg.id} className="mt-3 border-t border-border pt-3">
        <strong>{leg.ticket.strategy === 'VALUE' ? 'VALUE' : 'ELO / Intuice'} · {leg.ticket.windowKey} · tiket {leg.ticket.slot}</strong>
        <p>{leg.winnerName} + {leg.totalSide === 'OVER' ? 'více než' : leg.totalSide === 'UNDER' ? 'méně než' : leg.totalSide} {leg.totalLine} gólu</p>
        <p>Kurz nohy {leg.decimalOdds?.toFixed(2) ?? 'nezachycen'} · {leg.bookmaker ?? 'bookmaker nezachycen'} · typ ceny: {leg.priceKind}</p>
        <p>Noha: {!leg.settledAt ? '⏳ Čeká na vyhodnocení' : leg.hit === true ? '✅ Výhra' : leg.hit === false ? '❌ Prohra' : 'Výsledek není jednoznačně zachycen'}</p>
        <p>Celý tiket: {leg.ticket.status} · profit {leg.ticket.profit == null ? '—' : `${leg.ticket.profit.toFixed(2)} j`}</p>
        <p className="text-xs">Policy {leg.ticket.policyVersion} · CLV {leg.priceClv == null ? 'nezachyceno' : `${(leg.priceClv * 100).toFixed(2)} % (${leg.clvMethodVersion === 2 ? 'v2' : 'historická metodika'})`}</p>
      </li>)}</ul>}
    </section>
    <p className="text-sm text-muted">Detail čte uložené předzápasové očekávání a konečné vyhodnocení. Živý přenos ani nový modelový výpočet při otevření neprovádí.</p>
  </main></>;
}
