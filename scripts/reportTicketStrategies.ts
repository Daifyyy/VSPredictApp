import { prisma } from "../lib/db";
import { bestResultTotalPrice, parseBooks } from "../lib/picks/books";

async function main() {
for (const strategy of ["VALUE", "ELO_INTUITION"] as const) {
  const tickets = await prisma.intuitionTicket.findMany({ where: { strategy, status: "SETTLED" }, include: { legs: true }, orderBy: { settledAt: "asc" } });
  const checkpoint = [50, 100, 200].find((n) => tickets.length < n) ?? 200;
  const priced = tickets.filter((ticket) => ticket.combinedOdds != null && ticket.profit != null);
  const byPriceKind = (["DIRECT", "SYNTHETIC"] as const).map((priceKind) => { const rows = priced.filter((ticket) => ticket.priceKind === priceKind); return { priceKind, tickets: rows.length, roi: rows.length ? rows.reduce((sum, ticket) => sum + ticket.profit!, 0) / rows.length : null, averageOdds: rows.length ? rows.reduce((sum, ticket) => sum + ticket.combinedOdds!, 0) / rows.length : null }; });
  const legs = tickets.flatMap((ticket) => ticket.legs).filter((leg) => leg.hit != null);
  const fixtures = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: legs.map((leg) => leg.fixtureId) } }, select: { fixtureId: true, oddsCloseBooks: true } });
  const closeBooks = new Map(fixtures.map((fixture) => [fixture.fixtureId, parseBooks(fixture.oddsCloseBooks)]));
  const clvRows = tickets.flatMap((ticket) => { const close = ticket.legs.map((leg) => bestResultTotalPrice(closeBooks.get(leg.fixtureId) ?? [], leg.winner === "HOME" ? "home" : "away", leg.totalSide.toLowerCase() as "over"|"under", leg.totalLine)?.odds ?? null); return ticket.combinedOdds != null && close.every((odd):odd is number=>odd!=null) ? [ticket.combinedOdds / close.reduce((a,b)=>a*b,1)-1] : []; });
  const probability = (leg:typeof legs[number]) => strategy === "ELO_INTUITION" ? leg.eloJointProbability : leg.modelProbability;
  const logLoss = legs.length ? legs.reduce((sum, leg) => { const p = Math.max(.001, Math.min(.999, probability(leg) ?? .5)); return sum - Math.log(leg.hit ? p : 1-p); }, 0) / legs.length : null;
  const bins=Array.from({length:10},()=>({n:0,p:0,y:0})); for(const leg of legs){const p=Math.max(0,Math.min(.999,probability(leg)??.5));const bin=bins[Math.floor(p*10)];bin.n++;bin.p+=p;bin.y+=leg.hit?1:0} const calibrationEce=legs.length?bins.reduce((sum,bin)=>bin.n?sum+(bin.n/legs.length)*Math.abs(bin.p/bin.n-bin.y/bin.n):sum,0):null;
  console.log(JSON.stringify({ strategy, settledTickets:tickets.length, nextCheckpoint:checkpoint, ticketHitRate:tickets.length?tickets.filter(t=>t.hit).length/tickets.length:null, legHitRate:legs.length?legs.filter(l=>l.hit).length/legs.length:null, roi:priced.length?priced.reduce((s,t)=>s+t.profit!,0)/priced.length:null, averageOdds:priced.length?priced.reduce((s,t)=>s+t.combinedOdds!,0)/priced.length:null, byPriceKind, logLoss, calibrationEce, clv:clvRows.length?clvRows.reduce((a,b)=>a+b,0)/clvRows.length:null, clvSample:clvRows.length, note:"Strategie se automaticky nepovyšuje ani neslučuje; rozhodnutí patří až reportu 200 oceněných tiketů."}));
}}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
