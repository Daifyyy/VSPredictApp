"use client";

import { useCallback, useEffect, useState } from "react";
import type { PickMarket } from "@/lib/types";
import { PICK_PRESETS } from "@/lib/picks/rules";
import type {
  BacktestResult,
  BacktestSample,
  BenchmarkTrackRecord,
  TrackRecord,
} from "@/lib/picks/trackRecord";
import type {
  ReliabilityCurve,
  ReliabilityReport,
} from "@/lib/picks/reliability";
import type { MarketBenchmark } from "@/lib/picks/market";
import type { ClvSummary } from "@/lib/picks/clv";
import type {
  CountModelAccuracy,
  PublishedTipRecord,
} from "@/lib/picks/performance";
import {
  evaluateEdgeGate,
  type EdgeGate,
  type GateCriterion,
  type GateStatus,
} from "@/lib/picks/gate";
import { TeamLogo } from "./TeamLogo";
import { AppHeader } from "./AppHeader";
import { Empty } from "./Empty";
import { ViewTabs } from "./ViewTabs";
import type { SessionUser } from "./sessionUser";
import { PredictionOffers } from "./PredictionOffers";

type Venue = "home" | "away" | "any";

/**
 * Dva pohledy nad **týmiž** načtenými daty: „Tipy" = k čemu tam člověk jde, „Model" =
 * jestli se tomu dá věřit. Přepnutí nic nedotahuje.
 */
type View = "picks" | "market" | "model";

const MARKET_LABELS: Record<PickMarket, string> = {
  win: "Výhra",
  over25: "Přes 2.5 gólu",
  btts: "Oba skórují",
};

/**
 * Zpožděná hodnota. Posuvník minimální pravděpodobnosti má 9 kroků a **každý** z nich
 * spouštěl dva necachované requesty, z toho jeden běží backtest – protažení přes celý
 * rozsah tedy znamenalo ~18 dotazů, z nichž 17 nikoho nezajímá. Palec se hýbe okamžitě
 * (drží se vlastní `*Input` stav), data se dotahují až když se posuvník zastaví.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return settled;
}

interface StatsSetters {
  setTrack: (v: TrackRecord) => void;
  setBenchmark: (v: BenchmarkTrackRecord | null) => void;
  setMarketBench: (v: MarketBenchmark | null) => void;
  setBacktest: (v: BacktestResult | null) => void;
  setReliability: (v: ReliabilityReport | null) => void;
  setClv: (v: ClvSummary | null) => void;
  setEuropean: (v: EuropeanStats | null) => void;
  setPublishedTips: (v: PublishedTipRecord | null) => void;
  setCountAccuracy: (v: CountModelAccuracy | null) => void;
  setClvByMarket: (v: MarketClvSummary[]) => void;
  setStatsState: (v: "loading" | "ok" | "error") => void;
}

interface MarketClvSummary {
  market: "1X2" | "OVER_25" | "CORNERS" | "CARDS";
  context: "LEAGUE" | "EURO_CUP";
  publishedOnly: boolean;
  eligible: number;
  measured: number;
  completeness: number;
  averageClv: number;
  beatRate: number;
  averageModelVsOpen: number;
  averageModelVsClose: number;
}

interface EuropeanStats {
  experimental: boolean;
  promotionSample: number;
  trackRecord: TrackRecord;
  benchmark: BenchmarkTrackRecord | null;
  market: MarketBenchmark | null;
  clv: ClvSummary | null;
  publishedTips: PublishedTipRecord;
  countAccuracy: CountModelAccuracy;
}

/**
 * Diagnostika modelu (track-record, kalibrace, vs. trh, CLV) + backtest navoleného
 * pravidla. Mimo komponentu jako `loadPicks` – žádné synchronní `setState` v těle efektu.
 *
 * **Stav načítání je tu povinný, ne kosmetika.** `evaluateEdgeGate` spočítá verdikt i ze
 * samých `null`, takže se dřív po přepnutí na „Jak si model vede" ukázal hotový závěr
 * postavený na ničem a panely pod ním pak doskákaly. A `catch(() => {})` dělal ze
 * spadlého requestu „zatím nemáme data".
 */
async function loadStats(
  market: PickMarket,
  venue: Venue,
  minProb: number,
  minEdge: number | undefined,
  isActive: () => boolean,
  s: StatsSetters
): Promise<void> {
  s.setStatsState("loading");
  try {
    const q = new URLSearchParams({ market, venue, minProb: String(minProb) });
    if (minEdge != null) q.set("minEdge", String(minEdge));
    const r = await fetch(`/api/picks/stats?${q.toString()}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    if (!isActive()) return;
    if (d.trackRecord) s.setTrack(d.trackRecord);
    s.setBenchmark(d.benchmark ?? null);
    s.setMarketBench(d.market ?? null);
    s.setBacktest(d.backtest ?? null);
    s.setReliability(d.reliability ?? null);
    s.setClv(d.clv ?? null);
    s.setEuropean(d.european ?? null);
    s.setPublishedTips(d.publishedTips ?? null);
    s.setCountAccuracy(d.countAccuracy ?? null);
    s.setClvByMarket(d.clvByMarket ?? []);
    s.setStatsState("ok");
  } catch {
    if (isActive()) s.setStatsState("error");
  }
}

export function PicksApp({ user }: { user: SessionUser | null }) {
  const [restored, setRestored] = useState(false);
  const [view, setView] = useState<View>("picks");
  const [market, setMarket] = useState<PickMarket>("win");
  const [venue, setVenue] = useState<Venue>("home");
  const [minProbInput, setMinProb] = useState(0.65);
  const minProb = useDebouncedValue(minProbInput, 300);
  // Value režim: filtruje na tipy s kladnou hranou nad kurzem sázkovky (edge > 0).
  // Vypnutý → kurzy se ignorují (chování jako dnes, čistě pravděpodobnostní práh).
  const [valueOnly, setValueOnly] = useState(false);
  const minEdge = valueOnly ? 0 : undefined;
  // Skrýt tipy s málo daty (default ON) – ochrana na startu sezóny, kdy je vzorek tenký.
  // Gatuje jen seznam nadcházejících tipů, ne historický backtest (ten běží nad vším).
  const [hideUnready, setHideUnready] = useState(true);
  const [track, setTrack] = useState<TrackRecord | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkTrackRecord | null>(null);
  // `market` je už název pravidla (trh tipu) → benchmark proti sázkovce má vlastní jméno.
  const [marketBench, setMarketBench] = useState<MarketBenchmark | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [reliability, setReliability] = useState<ReliabilityReport | null>(null);
  const [clv, setClv] = useState<ClvSummary | null>(null);
  const [european, setEuropean] = useState<EuropeanStats | null>(null);
  const [publishedTips, setPublishedTips] = useState<PublishedTipRecord | null>(null);
  const [countAccuracy, setCountAccuracy] = useState<CountModelAccuracy | null>(null);
  const [clvByMarket, setClvByMarket] = useState<MarketClvSummary[]>([]);
  const [statsState, setStatsState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      const nextView = params.get("view");
      const nextMarket = params.get("market") as PickMarket | null;
      const nextVenue = params.get("venue") as Venue | null;
      const nextProbability = Number(params.get("minProb"));
      if (nextView === "picks" || nextView === "market" || nextView === "model") setView(nextView);
      if (nextMarket === "win" || nextMarket === "over25" || nextMarket === "btts") setMarket(nextMarket);
      if (nextVenue === "home" || nextVenue === "away" || nextVenue === "any") setVenue(nextVenue);
      if (Number.isFinite(nextProbability) && nextProbability >= 0.5 && nextProbability <= 0.95) setMinProb(nextProbability);
      if (params.get("value") === "1") setValueOnly(true);
      if (params.get("unready") === "1") setHideUnready(false);
      setRestored(true);
    });
  }, []);

  useEffect(() => {
    if (!restored) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.searchParams.set("market", market);
    url.searchParams.set("venue", venue);
    url.searchParams.set("minProb", minProbInput.toFixed(2));
    if (valueOnly) url.searchParams.set("value", "1");
    else url.searchParams.delete("value");
    if (hideUnready) url.searchParams.delete("unready");
    else url.searchParams.set("unready", "1");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [restored, view, market, venue, minProbInput, valueOnly, hideUnready]);

  // Track-record (globální) + backtest strategie dle navolených parametrů.
  //
  // **Stav načítání je tu povinný, ne kosmetika.** `evaluateEdgeGate` umí spočítat verdikt
  // i ze samých `null` – takže se dřív při přepnutí na „Jak si model vede" ukázal plně
  // vykreslený závěr postavený na ničem a panely pod ním pak doskákaly. A `catch(() => {})`
  // dělal ze spadlého requestu „zatím nemáme data".
  // Settery z `useState` jsou stabilní, takže objekt smí vzniknout na místě.
  const statsSetters = (): StatsSetters => ({
    setTrack,
    setBenchmark,
    setMarketBench,
    setBacktest,
    setReliability,
    setClv,
    setEuropean,
    setPublishedTips,
    setCountAccuracy,
    setClvByMarket,
    setStatsState,
  });

  const retryStats = useCallback(() => {
    void loadStats(market, venue, minProb, minEdge, () => true, statsSetters());
  }, [market, venue, minProb, minEdge]);

  useEffect(() => {
    if (!restored || view !== "model") return;
    let active = true;
    void loadStats(market, venue, minProb, minEdge, () => active, statsSetters());
    return () => {
      active = false;
    };
  }, [restored, view, market, venue, minProb, minEdge]);

  return (
    <main className="app-page">
      <AppHeader user={user} />

      <h1>Predikce</h1>
      {/* Rozpor „jmenuje se to tipy, ale nesázej podle toho" se řeší TADY, ne až ve
          třetím panelu, kam se doroluje málokdo. */}
      <p className="mt-1 text-sm text-muted">
        Kompletní nabídka uložených prognóz, jejich porovnání s odmaržovaným trhem a
        dlouhodobá výkonnost. <span className="font-medium text-foreground">Rozdíl proti trhu není automaticky sázkové doporučení.</span>
      </p>

      <ViewTabs
        tabs={[
          { value: "picks", label: "Nabídka zápasů" },
          { value: "market", label: "Model vs. trh" },
          { value: "model", label: "Výkonnost modelů" },
        ]}
        active={view}
        onSelect={setView}
      />

      <ViewPurpose view={view} />

      {view === "picks" || view === "market" ? (
        <PredictionOffers user={user} marketView={view === "market"} />
      ) : (
        <ModelView
          reliability={reliability}
          marketBench={marketBench}
          clv={clv}
          track={track}
          benchmark={benchmark}
          state={statsState}
          european={european}
          publishedTips={publishedTips}
          countAccuracy={countAccuracy}
          clvByMarket={clvByMarket}
          backtest={backtest}
          market={market}
          venue={venue}
          minProb={minProb}
          onRetry={retryStats}
        />
      )}
    </main>
  );
}

function ViewPurpose({ view }: { view: View }) {
  const content: Record<View, { title: string; text: string }> = {
    picks: {
      title: "Co model očekává",
      text: "Kompletní nabídka uložených prognóz. Rychlé výběry pouze filtrují scénáře; nejsou automatickým sázkovým tipem.",
    },
    market: {
      title: "Kde se model liší od trhu",
      text: "Stejné zápasy doplněné o odmaržované tržní pravděpodobnosti a jejich pohyb. Rozdíl model–trh sám nepotvrzuje výhodu.",
    },
    model: {
      title: "Jak přesné jsou výstupy",
      text: "Dlouhodobé vyhodnocení prognóz, publikovaných tipů a pohybu trhu. Tady patří kalibrace, CLV a velikost vzorku.",
    },
  };
  const item = content[view];
  return (
    <aside className="mt-3 rounded-xl border border-border bg-background px-4 py-3" aria-label="Účel zvoleného pohledu">
      <p className="text-xs font-bold text-foreground">{item.title}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{item.text}</p>
    </aside>
  );
}

/**
 * Záložka „Jak si model vede" = **brána z `CLAUDE.md`, vykreslená**. Nahoře jedna
 * odpověď, pod ní tři kritéria v řetězci; původní panely v nich sedí jako důkaz pod
 * rozbalovačem. Dřív to bylo pět nesouvisejících čísel bez měřítka — u žádného nebylo
 * poznat, co je dobře a od jakého vzorku mu věřit.
 */
function ModelView({
  reliability,
  marketBench,
  clv,
  track,
  benchmark,
  state,
  european,
  publishedTips,
  countAccuracy,
  clvByMarket,
  backtest,
  market,
  venue,
  minProb,
  onRetry,
}: {
  reliability: ReliabilityReport | null;
  marketBench: MarketBenchmark | null;
  clv: ClvSummary | null;
  track: TrackRecord | null;
  benchmark: BenchmarkTrackRecord | null;
  state: "loading" | "ok" | "error";
  european: EuropeanStats | null;
  publishedTips: PublishedTipRecord | null;
  countAccuracy: CountModelAccuracy | null;
  clvByMarket: MarketClvSummary[];
  backtest: BacktestResult | null;
  market: PickMarket;
  venue: Venue;
  minProb: number;
  onRetry: () => void;
}) {
  // Verdikt se smí vykreslit až nad načtenými daty. Brána sama o sobě `null` vstupy snese
  // (vrátí „ZATÍM NEVÍME"), jenže to je tvrzení o modelu – ne o tom, že se ještě načítá.
  if (state === "loading") return <ModelSkeleton />;
  if (state === "error") {
    return (
      <Empty>
        <p>Diagnostiku modelu se nepodařilo načíst.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground transition hover:bg-background"
        >
          ↻ Zkusit znovu
        </button>
      </Empty>
    );
  }

  const gate = evaluateEdgeGate({ reliability, market: marketBench, clv });
  const evidence: Record<GateCriterion["key"], React.ReactNode> = {
    calibration: reliability ? <ReliabilityPanel reliability={reliability} /> : null,
    vsMarket: (
      <>
        {marketBench && marketBench.n > 0 && <MarketPanel market={marketBench} />}
      </>
    ),
    clv: clv && clv.n > 0 ? <ClvPanel clv={clv} /> : null,
  };

  return (
    <div className="mt-4 space-y-3">
      <MarketClvDashboard rows={clvByMarket} />
      {backtest && <StrategyPanel backtest={backtest} market={market} venue={venue} minProb={minProb} settled={track?.n ?? 0} />}
      <PublishedTipsPanel league={publishedTips} european={european?.publishedTips ?? null} />
      <ForecastOverview track={track} counts={countAccuracy} />
      <GateHeadline gate={gate} />
      {gate.criteria.map((c, i) => (
        <CriterionCard key={c.key} index={i + 1} criterion={c} evidence={evidence[c.key]} />
      ))}
      {/* Mimo bránu schválně: porazit predikce API-Footballu o ničem nerozhoduje –
          rozhodčím je trh (kritérium 2). Je to doplněk, ne kritérium. */}
      {benchmark && benchmark.n > 0 && <BenchmarkPanel benchmark={benchmark} />}
      {european && (
        <section className="rounded-2xl border border-warning/35 bg-warning/5 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="page-kicker text-warning">Experimentální · evropské poháry</p>
              <h3 className="mt-1 font-bold text-foreground">Samostatný pohárový track record</h3>
              <p className="mt-1 text-xs leading-5 text-muted">Liga mistrů, Evropská liga a Konferenční liga se nezapočítávají do ověřených ligových výsledků. Označení zůstane nejméně do {european.promotionSample} uzavřených predikcí.</p>
            </div>
            <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">{european.trackRecord.n} / {european.promotionSample}</span>
          </div>
          <div className="mt-3 space-y-3">
            <TrackRecordPanel track={european.trackRecord} />
            <CountAccuracyPanel accuracy={european.countAccuracy} compact />
            {european.market && european.market.n > 0 && <MarketPanel market={european.market} />}
            {european.clv && european.clv.n > 0 && <ClvPanel clv={european.clv} />}
            {european.benchmark && european.benchmark.n > 0 && <BenchmarkPanel benchmark={european.benchmark} />}
          </div>
        </section>
      )}
    </div>
  );
}

const CLV_MARKET_LABELS: Record<MarketClvSummary["market"], string> = {
  "1X2": "1X2",
  OVER_25: "Góly · Over/Under 2,5",
  CORNERS: "⛳ Rohy",
  CARDS: "🟨 Karty",
};

function MarketClvDashboard({ rows }: { rows: MarketClvSummary[] }) {
  const [history, setHistory] = useState<Array<{
    id: string; fixtureId: number; market: string; side: string; line: number | null;
    modelProbability: number; openMarketProbability: number; closeMarketProbability: number | null;
    clv: number | null; kickoff: string; series: unknown;
    prediction: { homeName: string; awayName: string; homeGoals: number | null; awayGoals: number | null; status: string } | null;
    actual: { corners: number; cards: number } | null;
  }> | null>(null);
  const [historyLocked, setHistoryLocked] = useState(false);

  function loadHistory() {
    if (history || historyLocked) return;
    fetch("/api/picks/clv?limit=20")
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (response.status === 403) setHistoryLocked(true);
        else if (response.ok) setHistory(body.rows ?? []);
      });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="page-kicker">Pohyb trhu po prognóze</p>
      <h2 className="mt-1 text-lg font-bold text-foreground">Closing line value (CLV)</h2>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
        Sledujeme stejnou stranu a stejnou linii od prvního uloženého kurzu do uzavření.
        Kladný posun znamená, že se trh později přiklonil směrem k tehdejšímu názoru modelu;
        není to výhra zápasu ani automaticky zisková sázka.
      </p>
      {rows.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map((row) => <ClvMarketCard key={`${row.context}-${row.market}-${row.publishedOnly}`} row={row} />)}
      </div> : <p className="mt-3 rounded-xl bg-background p-3 text-sm text-muted">Nové verzované měření začíná prvním kurzovým snapshotem po nasazení. Starší průběh zpětně nevymýšlíme.</p>}
      <details className="mt-3 rounded-xl border border-border bg-background" onToggle={(event) => event.currentTarget.open && loadHistory()}>
        <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-foreground">Historie jednotlivých zápasů</summary>
        <div className="border-t border-border p-3">
          {historyLocked ? <p className="text-sm text-muted">Detailní historie a průběhy trhu jsou součástí PRO.</p>
            : history == null ? <p className="text-sm text-muted">Načítám historii…</p>
            : history.length === 0 ? <p className="text-sm text-muted">Zatím není uzavřený měřený zápas.</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead><tr className="text-muted"><th className="p-2">Zápas</th><th>Trh</th><th>Model</th><th>Otevření</th><th>Průběh</th><th>Uzavření</th><th>CLV</th><th>Výsledek</th></tr></thead><tbody>{history.map((row) => <ClvHistoryRow key={row.id} row={row} />)}</tbody></table></div>}
        </div>
      </details>
    </section>
  );
}

function ClvMarketCard({ row }: { row: MarketClvSummary }) {
  const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} p. b.`;
  return <article className="rounded-xl border border-border bg-background p-3">
    <div className="flex items-start justify-between gap-2"><div><strong className="text-foreground">{CLV_MARKET_LABELS[row.market]}</strong><p className="text-[10px] text-muted">{row.context === "EURO_CUP" ? "Experimentální · Evropa" : "Ligové zápasy"}{row.publishedOnly ? " · publikované tipy" : " · všechny směry"}</p></div><span className="text-[10px] text-muted">{row.measured}/{row.eligible}</span></div>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div><dt className="text-muted">Průměrný posun trhu</dt><dd className="font-bold tabular-nums text-foreground">{pct(row.averageClv)}</dd></div>
      <div><dt className="text-muted">Před trhem</dt><dd className="font-bold tabular-nums text-foreground">{Math.round(row.beatRate * 100)} %</dd></div>
      <div><dt className="text-muted">Datová úplnost</dt><dd className="font-bold tabular-nums text-foreground">{Math.round(row.completeness * 100)} %</dd></div>
      <div><dt className="text-muted">Model vs. uzavření</dt><dd className="font-bold tabular-nums text-foreground">{pct(row.averageModelVsClose)}</dd></div>
    </dl>
    <p className="mt-2 text-[10px] leading-4 text-muted">Úplnost říká, u kolika způsobilých prognóz máme srovnatelné otevření i uzavření. Nízká hodnota znamená méně reprezentativní vzorek.</p>
  </article>;
}

function ClvHistoryRow({ row }: { row: {
  market: string; side: string; line: number | null; modelProbability: number; openMarketProbability: number;
  closeMarketProbability: number | null; clv: number | null;
  closingMinutesToKickoff?: number | null;
  series?: unknown;
  prediction: { homeName: string; awayName: string; homeGoals: number | null; awayGoals: number | null } | null;
  actual: { corners: number; cards: number } | null;
} }) {
  const probability = (value: number | null) => value == null ? "—" : `${Math.round(value * 100)} %`;
  const result = row.market === "CORNERS" ? row.actual?.corners : row.market === "CARDS" ? row.actual?.cards : row.prediction?.homeGoals != null ? `${row.prediction.homeGoals}:${row.prediction.awayGoals}` : null;
  return <tr className="border-t border-border"><td className="p-2 font-medium text-foreground">{row.prediction ? `${row.prediction.homeName} – ${row.prediction.awayName}` : "Zápas"}</td><td>{row.market}{row.line != null ? ` ${row.line}` : ""} · {row.side}</td><td>{probability(row.modelProbability)}</td><td>{probability(row.openMarketProbability)}</td><td><ClvSparkline value={row.series} /></td><td>{probability(row.closeMarketProbability)}{row.closingMinutesToKickoff != null ? <small className="block text-[9px] text-muted">{Math.round(row.closingMinutesToKickoff)} min před výkopem</small> : null}</td><td className={row.clv != null && row.clv > 0 ? "font-bold text-positive" : "text-warning"}>{row.clv == null ? "—" : `${row.clv >= 0 ? "+" : ""}${(row.clv * 100).toFixed(1)} p. b.`}</td><td>{result ?? "—"}</td></tr>;
}

function ClvSparkline({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return <span className="text-muted">—</span>;
  const points = value.filter((item): item is { t: number; p: number } => typeof item === "object" && item !== null && typeof item.t === "number" && typeof item.p === "number");
  if (points.length < 2) return <span className="text-muted">—</span>;
  const min = Math.min(...points.map((point) => point.p));
  const max = Math.max(...points.map((point) => point.p));
  const spread = Math.max(0.01, max - min);
  const path = points.map((point, index) => `${index ? "L" : "M"} ${index * 72 / (points.length - 1)} ${22 - (point.p - min) / spread * 18}`).join(" ");
  return <svg viewBox="0 0 72 24" className="h-6 w-[72px]" role="img" aria-label={`Vývoj trhu z ${Math.round(points[0].p * 100)} na ${Math.round(points.at(-1)!.p * 100)} procent`}><path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-strong" /></svg>;
}

function formatRecordDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })
    : "—";
}

function PublishedTipsPanel({
  league,
  european,
}: {
  league: PublishedTipRecord | null;
  european: PublishedTipRecord | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="page-kicker">Skutečně publikované výběry</p>
      <h2 className="mt-1 text-lg font-bold text-foreground">Publikované tipy 1X2</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Jen tipy uložené před výkopem: alespoň 55 %, náskok 10 p. b., vzorek 6 a bez
        příznaku nízké spolehlivosti. Starší prognózy se zpětně nezapočítávají.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PublishedRecordCard title="Ligové soutěže" record={league} />
        <PublishedRecordCard title="Experimentální · Evropa" record={european} experimental />
      </div>
    </section>
  );
}

function PublishedRecordCard({ title, record, experimental = false }: { title: string; record: PublishedTipRecord | null; experimental?: boolean }) {
  const hasResult = Boolean(record && record.n > 0);
  return (
    <div className={`rounded-xl border p-3 ${experimental ? "border-warning/30 bg-warning/5" : "border-border bg-background"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {record?.policyVersions.length ? <span className="text-[10px] text-muted">politika v{record.policyVersions.join(", v")}</span> : null}
      </div>
      {hasResult ? (
        <div className="mt-2 flex items-baseline gap-2">
          <strong className="text-3xl tabular-nums text-foreground">{Math.round(record!.hitRate! * 100)} %</strong>
          <span className="text-sm text-muted">{record!.hits}/{record!.n} tipů</span>
        </div>
      ) : <p className="mt-3 text-sm text-muted">Zatím nemáme vyhodnocený publikovaný tip.</p>}
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2 text-[11px]">
        <div><dt className="text-muted">Čeká</dt><dd className="font-semibold tabular-nums text-foreground">{record?.pending ?? 0}</dd></div>
        <div><dt className="text-muted">Od</dt><dd className="font-semibold text-foreground">{formatRecordDate(record?.firstPublishedAt ?? null)}</dd></div>
        <div><dt className="text-muted">Naposledy</dt><dd className="font-semibold text-foreground">{formatRecordDate(record?.lastPublishedAt ?? null)}</dd></div>
      </dl>
    </div>
  );
}

function ForecastOverview({ track, counts }: { track: TrackRecord | null; counts: CountModelAccuracy | null }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="page-kicker text-muted">Diagnostika pravděpodobností</p>
      <h2 className="mt-1 text-lg font-bold text-foreground">Všechny prognózy</h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Měří každý odehraný výstup modelu, i když nesplnil podmínky publikovaného tipu.
        Tato čísla proto nejsou sázkovou bilancí.
      </p>
      {track && <TrackRecordPanel track={track} embedded />}
      {counts && <CountAccuracyPanel accuracy={counts} />}
    </section>
  );
}

function CountAccuracyPanel({ accuracy, compact = false }: { accuracy: CountModelAccuracy; compact?: boolean }) {
  return (
    <div className={`${compact ? "mt-3" : "mt-4 border-t border-border pt-4"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Očekávané počty</h3>
        <span className="text-[10px] text-muted">tolerance ±1</span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <CountAccuracyCard icon="⛳" label="Rohy" value={accuracy.corners} />
        <CountAccuracyCard icon="🟨" label="Karty" value={accuracy.cards} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Jde o přesnost očekávaného celkového počtu, nikoliv o Over/Under tip. Chybějící
        skutečné statistiky se do přesnosti nepočítají a projeví se v pokrytí.
      </p>
    </div>
  );
}

function CountAccuracyCard({ icon, label, value }: { icon: string; label: string; value: CountModelAccuracy["corners"] }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <div className="flex items-center justify-between"><span className="text-sm font-semibold text-foreground">{icon} {label}</span><span className="text-[10px] text-muted">pokrytí {value.coverage == null ? "—" : `${Math.round(value.coverage * 100)} %`}</span></div>
      {value.n > 0 ? <><div className="mt-2 flex items-baseline gap-2"><strong className="text-2xl tabular-nums text-foreground">{Math.round(value.toleranceRate! * 100)} %</strong><span className="text-xs text-muted">v toleranci ({value.withinTolerance}/{value.n})</span></div><p className="mt-1 text-[11px] text-muted">Průměrná absolutní chyba {value.mae!.toFixed(1)}</p></> : <p className="mt-2 text-sm text-muted">Zatím chybí společný vzorek predikce a skutečnosti.</p>}
      {value.versions.map((version) => (
        <details key={version.version} className="mt-3 border-t border-border pt-2 text-[11px]">
          <summary className="cursor-pointer font-semibold text-foreground">
            Experimentální model v{version.version} · {version.lineN}/{version.n} s tržní linií
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-2 text-muted">
            <span>Brier<br /><b className="text-foreground">{version.brier?.toFixed(3) ?? "—"}</b></span>
            <span>Log-loss<br /><b className="text-foreground">{version.logLoss?.toFixed(3) ?? "—"}</b></span>
            <span>Kalibrační chyba<br /><b className="text-foreground">{version.ece?.toFixed(3) ?? "—"}</b></span>
          </div>
          <p className="mt-2 text-muted">Disperze {version.varianceRatio.toFixed(1)} · malý vzorek, bez sázkového doporučení.</p>
          {version.calibration.some((bin) => bin.n > 0) && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left">
                <thead><tr className="text-muted"><th>Pásmo modelu</th><th>n</th><th>Model</th><th>Skutečnost</th></tr></thead>
                <tbody>{version.calibration.filter((bin) => bin.n > 0).map((bin) => <tr key={bin.lower} className="border-t border-border"><td>{Math.round(bin.lower * 100)}–{Math.round(bin.upper * 100)} %</td><td>{bin.n}</td><td>{bin.predicted == null ? "—" : `${Math.round(bin.predicted * 100)} %`}</td><td>{bin.observed == null ? "—" : `${Math.round(bin.observed * 100)} %`}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {version.edgeBands.some((band) => band.n > 0) && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[390px] text-left">
                <thead><tr className="text-muted"><th>Model–trh</th><th>n</th><th>Model</th><th>Trh</th><th>Skutečnost</th></tr></thead>
                <tbody>{version.edgeBands.filter((band) => band.n > 0).map((band) => <tr key={band.label} className="border-t border-border"><td>{band.label}</td><td>{band.n}</td><td>{band.predicted == null ? "—" : `${Math.round(band.predicted * 100)} %`}</td><td>{band.market == null ? "—" : `${Math.round(band.market * 100)} %`}</td><td>{band.observed == null ? "—" : `${Math.round(band.observed * 100)} %`}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

const GATE_TONE: Record<GateStatus, string> = {
  pass: "border-positive/40 bg-positive/10",
  fail: "border-border bg-surface",
  insufficient: "border-border bg-surface",
};

const GATE_ANSWER: Record<GateStatus, string> = {
  pass: "ZATÍM ANO",
  fail: "ZATÍM NE",
  insufficient: "ZATÍM NEVÍME",
};

function GateHeadline({ gate }: { gate: EdgeGate }) {
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${GATE_TONE[gate.status]}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Má model hranu?</p>
        <span className="shrink-0 text-sm font-bold tracking-wide text-foreground">
          {GATE_ANSWER[gate.status]}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        {gate.headline} Než se dá uvažovat o sázení, musí projít všechna tři kritéria
        níž — a projít musí <em>v tomhle pořadí</em>.
      </p>
    </section>
  );
}

const STATUS_MARK: Record<GateStatus, { icon: string; cls: string }> = {
  pass: { icon: "✓", cls: "text-positive" },
  fail: { icon: "✗", cls: "text-negative" },
  insufficient: { icon: "—", cls: "text-muted" },
};

/** Jedno kritérium brány: otázka → odpověď → co by se muselo stát → důkaz pod rozbalovačem. */
function CriterionCard({
  index,
  criterion,
  evidence,
}: {
  index: number;
  criterion: GateCriterion;
  evidence: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const mark = STATUS_MARK[criterion.status];
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-baseline gap-2">
        <span className={`shrink-0 text-sm font-bold ${mark.cls}`} aria-hidden>
          {mark.icon}
        </span>
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {index}. {criterion.question}
        </h2>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-foreground">{criterion.summary}</p>
      {criterion.requirement && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          <span className="font-semibold uppercase tracking-wide">Muselo by:</span>{" "}
          {criterion.requirement}
        </p>
      )}
      {criterion.caveat && (
        <p className="mt-1.5 rounded-lg bg-background px-2.5 py-2 text-[11px] leading-snug text-muted">
          <span aria-hidden>⚠ </span>
          {criterion.caveat}
        </p>
      )}
      {evidence && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-2 text-[11px] text-muted transition hover:text-foreground"
          >
            {open ? "▾" : "▸"} Podrobně
          </button>
          {open && <div className="-mx-1">{evidence}</div>}
        </>
      )}
    </section>
  );
}

const VENUE_LABELS: Record<Venue, string> = {
  home: "doma",
  away: "venku",
  any: "doma i venku",
};

/**
 * Pod tolik tipů se úspěšnost **nevykresluje jako číslo**. „100 % (1/1)" ve velkém tučném
 * fontu vypadá jako výsledek, ačkoli je to jeden zápas – a odznak „malý vzorek" pod tím
 * to nezachrání, protože oko čte nejdřív to velké číslo.
 */
const STRATEGY_MIN_SAMPLE = 10;

function strategyLabel(market: PickMarket, venue: Venue, minProb: number): string {
  const pct = Math.round(minProb * 100);
  if (market === "over25") return `Přes 2.5 gólu ≥ ${pct} %`;
  if (market === "btts") return `Oba skórují ≥ ${pct} %`;
  return `Favorit ${VENUE_LABELS[venue]} ≥ ${pct} %`;
}

function StrategyPanel({
  backtest,
  market,
  venue,
  minProb,
  settled,
}: {
  backtest: BacktestResult;
  market: PickMarket;
  venue: Venue;
  minProb: number;
  /** Kolik odehraných predikcí vůbec máme (na aktuální verzi modelu). */
  settled: number;
}) {
  const small = backtest.n > 0 && backtest.n < 30;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Historický simulátor pravidla
        </p>
        <span className="text-[11px] text-muted">{backtest.n} vsazených tipů</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">{strategyLabel(market, venue, minProb)}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        Hypoteticky aplikuje aktuální filtr na historii. Nejde o bilanci skutečně
        publikovaných tipů podle pevné politiky 55 % + náskok 10 p. b.
      </p>
      {backtest.n < STRATEGY_MIN_SAMPLE ? (
        // Rada „zkus nižší práh" je po filtru verze modelu ZAVÁDĚJÍCÍ, když ještě nemáme
        // skoro žádné odehrané predikce – chyba není v prahu, ale v tom, že není co měřit.
        // A velké „100 %" z jednoho zápasu je horší než žádné číslo: vypadá jako výsledek.
        <p className="mt-2 text-sm text-muted">
          {backtest.n > 0
            ? `Zatím tomuhle pravidlu odpovídá ${backtest.n} odehraných ${
                backtest.n === 1 ? "zápas" : backtest.n < 5 ? "zápasy" : "zápasů"
              } – na úspěšnost je to málo. Číslo naskočí během sezóny.`
            : settled < 30
              ? `Na aktuální verzi modelu máme zatím ${settled} odehraných ${
                  settled === 1 ? "zápas" : settled < 5 ? "zápasy" : "zápasů"
                }. Číslo naskočí během sezóny.`
              : "Žádný z odehraných zápasů neodpovídá tomuhle pravidlu. Zkus nižší práh nebo jiný trh."}
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-foreground">
              {Math.round((backtest.hitRate ?? 0) * 100)} %
            </span>
            <span className="text-sm text-muted">
              úspěšnost ({backtest.hits} / {backtest.n})
            </span>
          </div>
          {small && (
            <p className="mt-2 text-[11px] text-warning">
              Malý vzorek – čísla jsou zatím orientační.
            </p>
          )}
          {backtest.samples.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Posledních {backtest.samples.length} z {backtest.n} tipů
              </p>
              <ul className="mt-2 space-y-1.5">
                {backtest.samples.map((s) => (
                  <SampleRow key={s.fixtureId} sample={s} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function sampleTipLabel(sample: BacktestSample): string {
  if (sample.market === "over25") return MARKET_LABELS.over25;
  if (sample.market === "btts") return MARKET_LABELS.btts;
  return sample.side === "home" ? "Domácí výhra" : "Hostující výhra";
}

function SampleRow({ sample }: { sample: BacktestSample }) {
  const date = new Date(sample.kickoff).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
  });
  return (
    <li className="rounded-lg bg-background px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 text-sm font-bold ${
            sample.hit ? "text-positive" : "text-negative"
          }`}
          aria-label={sample.hit ? "Tip vyšel" : "Tip nevyšel"}
        >
          {sample.hit ? "✓" : "✗"}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
          <TeamLogo src={sample.home.logoUrl} alt={sample.home.name} size={16} />
          <span className="min-w-0 truncate font-medium text-home">{sample.home.name}</span>
          <span className="shrink-0 font-bold tabular-nums text-foreground">
            {sample.homeGoals}:{sample.awayGoals}
          </span>
          <span className="min-w-0 truncate font-medium text-away">{sample.away.name}</span>
          <TeamLogo src={sample.away.logoUrl} alt={sample.away.name} size={16} />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">
          {date} · {sampleTipLabel(sample)}
        </span>
        <span className="shrink-0 tabular-nums">{Math.round(sample.prob * 100)} %</span>
      </div>
    </li>
  );
}

function TrackRecordPanel({ track, embedded = false }: { track: TrackRecord; embedded?: boolean }) {
  const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);
  const small = track.n > 0 && track.n < 30;
  return (
    <section className={embedded ? "mt-4" : "mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Přesnost všech prognóz
        </p>
        <span className="text-[11px] text-muted">{track.n} odehraných predikcí</span>
      </div>
      {track.n === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Zatím nemáme odehrané predikce. Track-record se naplní, jak budou zápasy odehrané.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Výsledek (1X2)" value={pct(track.outcomeAccuracy)} />
            <Stat label="Přes 2.5" value={pct(track.over25Accuracy)} />
            <Stat label="Oba skórují" value={pct(track.bttsAccuracy)} />
          </div>
          {small && (
            <p className="mt-2 text-[11px] text-warning">
              Malý vzorek – čísla jsou zatím orientační.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-2">
      <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/**
 * Náš model vs. TRH (odmaržované kurzy) na stejných klubových zápasech. Nejtvrdší
 * měřítko, jaké máme: dokud trh vede, jsou „value" tipy spíš chybou modelu než hranou.
 * Reprezentace vynechané (nemají kurzy a jsou napříč konfederacemi nesrovnatelné).
 */
function MarketPanel({ market }: { market: MarketBenchmark }) {
  const { n, our, market: mkt, avgOverround } = market;
  if (!our || !mkt) return null;
  const beatsMarket = our.logloss < mkt.logloss;
  const diff = Math.abs(mkt.logloss - our.logloss);
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Náš model vs. kurzy sázkovky
        </p>
        <span className="text-[11px] text-muted">{n} klubových zápasů</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div
          className={`rounded-xl p-2.5 ${
            beatsMarket ? "bg-positive/10 ring-1 ring-positive/30" : "bg-background"
          }`}
        >
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {our.logloss.toFixed(3)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Náš model</div>
        </div>
        <div
          className={`rounded-xl p-2.5 ${
            !beatsMarket ? "bg-positive/10 ring-1 ring-positive/30" : "bg-background"
          }`}
        >
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {mkt.logloss.toFixed(3)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Trh (bez marže)</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Log-loss 1X2 (nižší = lepší) proti kurzům očištěným o marži
        {avgOverround != null && ` (⌀ ${((avgOverround - 1) * 100).toFixed(1)} %)`}.{" "}
        {beatsMarket ? (
          <span className="font-semibold text-positive">
            ✅ Model překonává trh o {diff.toFixed(3)}.
          </span>
        ) : (
          <span className="font-semibold text-foreground">
            ⚠ Trh je lepší o {diff.toFixed(3)} → rozdíly proti trhu ber jako podnět
            k prozkoumání, ne jako hranu.
          </span>
        )}
        {n < 100 && " Malý vzorek – orientační."}
      </p>
      {/* „Nesázej podle toho" se říká v leadu stránky, ne až tady – doroloval se sem
          málokdo. Zůstává jen tvrdé číslo z offline backtestu jako kontext k rozdílu. */}
      <p className="mt-2 text-[11px] text-muted">
        Pro měřítko: offline backtest na 9 271 zápasech se zavíracími kurzy dal náš model
        1.024 vs. trh 0.976 a plochá sázka podle modelu −5 až −10 % ROI (interval
        spolehlivosti nulu neobsahuje).
      </p>
    </section>
  );
}

/**
 * CLV = posun linie od našeho snímku kurzu k zavření. Je to **jediný ukazatel hrany
 * viditelný hned**, zatímco na verdikt z výsledků jsou potřeba stovky zápasů (fotbal je
 * z valné části náhoda). Kladné CLV je nutná podmínka dlouhodobě ziskového sázení.
 */
function ClvPanel({ clv }: { clv: ClvSummary }) {
  const pb = clv.avgClv * 100;
  const good = pb > 0;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Pohyb linie po našem tipu (CLV)
        </p>
        <span className="text-[11px] text-muted">{clv.n} tipů</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className={`rounded-xl p-2.5 ${good ? "bg-positive/10 ring-1 ring-positive/30" : "bg-background"}`}>
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {pb > 0 ? "+" : ""}
            {pb.toFixed(2)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">⌀ posun (p.b.)</div>
        </div>
        <div className="rounded-xl bg-background p-2.5">
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {Math.round(clv.beatRate * 100)} %
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">tipů před trhem</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Kladné číslo znamená, že se trh po našem tipu pohnul <em>naším směrem</em> — to je
        známka hrany dřív, než ji potvrdí výsledky. Náhodné tipy dají kolem 0 a 50 %.
        {clv.n < 100 && " Malý vzorek – orientační."}
      </p>
    </section>
  );
}

function BenchmarkPanel({ benchmark }: { benchmark: BenchmarkTrackRecord }) {
  const { n, our, bench } = benchmark;
  if (!our || !bench) return null;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const small = n < 30;
  // Log-loss je férovější ukazatel kvality pravděpodobností než holá přesnost
  // (nižší = lepší). Verdikt podle něj, ne podle argmaxu (ten je zašuměný).
  const better =
    our.logloss < bench.logloss
      ? "our"
      : our.logloss > bench.logloss
        ? "bench"
        : "tie";
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Náš model vs. API-Football
        </p>
        <span className="text-[11px] text-muted">{n} společných zápasů</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div
          className={`rounded-xl p-2.5 ${
            better === "our" ? "bg-positive/10 ring-1 ring-positive/30" : "bg-background"
          }`}
        >
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {pct(our.accuracy)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Náš model</div>
        </div>
        <div
          className={`rounded-xl p-2.5 ${
            better === "bench" ? "bg-positive/10 ring-1 ring-positive/30" : "bg-background"
          }`}
        >
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {pct(bench.accuracy)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">API-Football</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Přesnost 1X2 (argmax) na stejných zápasech. Kvalita pravděpodobností (log-loss,
        nižší = lepší):{" "}
        <span className="font-semibold text-foreground">{our.logloss.toFixed(3)}</span> vs{" "}
        {bench.logloss.toFixed(3)} →{" "}
        {better === "our"
          ? "✅ vedeme"
          : better === "bench"
            ? "⚠ vede API-Football"
            : "≈ vyrovnané"}
        .
      </p>
      {small && (
        <p className="mt-2 text-[11px] text-warning">
          Malý vzorek – čísla jsou zatím orientační.
        </p>
      )}
    </section>
  );
}

const RELIABILITY_LABELS: Record<ReliabilityCurve["market"], string> = {
  "1x2": "Výsledek (1X2)",
  over25: "Přes 2.5 gólu",
  btts: "Oba skórují",
};

/**
 * Kalibrace modelu: když řekneme „X %", padne to opravdu v ~X %? Per trh rozbinované
 * predikce vs. skutečnost + ECE (čím níž, tím líp). FREE – buduje důvěru v čísla.
 * Vykreslí se až jsou nějaké odehrané predikce (mimo sezónu prázdno → null).
 */
function ReliabilityPanel({ reliability }: { reliability: ReliabilityReport }) {
  const curves = [reliability.outcome, reliability.over25, reliability.btts];
  if (curves.every((c) => c.n === 0)) return null;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Kalibrace modelu
      </p>
      <p className="mt-1 text-[11px] text-muted">
        Když řekneme „X %“, padne to opravdu v ~X %? Predikováno vs. skutečnost.
      </p>
      <div className="mt-3 space-y-4">
        {curves.map((c) => (
          <ReliabilityCurveView key={c.market} curve={c} />
        ))}
      </div>
    </section>
  );
}

function calibrationVerdict(ece: number): { text: string; cls: string } {
  if (ece < 0.05) return { text: "✅ dobře kalibrováno", cls: "text-positive" };
  if (ece < 0.1) return { text: "mírná odchylka", cls: "text-muted" };
  return { text: "⚠ kalibrace odchýlená", cls: "text-warning" };
}

function ReliabilityCurveView({ curve }: { curve: ReliabilityCurve }) {
  const populated = curve.bins.filter((b) => b.count > 0);
  if (populated.length === 0) return null;
  const small = curve.n > 0 && curve.n < 30;
  const verdict = curve.ece == null ? null : calibrationVerdict(curve.ece);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs font-semibold text-foreground">
          {RELIABILITY_LABELS[curve.market]}
        </span>
        <span className="text-[11px] text-muted">
          {curve.ece != null && verdict && (
            <>
              ECE <span className="tabular-nums">{curve.ece.toFixed(3)}</span> ·{" "}
              <span className={verdict.cls}>{verdict.text}</span> ·{" "}
            </>
          )}
          n {curve.n}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {populated.map((b) => (
          <ReliabilityBinRow key={b.lower} bin={b} />
        ))}
      </div>
      {small && (
        <p className="mt-1.5 text-[11px] text-warning">
          Malý vzorek – kalibrace je zatím orientační.
        </p>
      )}
    </div>
  );
}

function ReliabilityBinRow({
  bin,
}: {
  bin: ReliabilityCurve["bins"][number];
}) {
  const observed = bin.observed ?? 0;
  const predicted = bin.avgPredicted ?? 0;
  const off = Math.abs(observed - predicted);
  // Barva sloupce dle odchylky pozorováno vs. predikováno (čím blíž diagonále, tím líp).
  const barCls = off < 0.1 ? "bg-positive/70" : off < 0.2 ? "bg-warning/70" : "bg-negative/70";
  const p = (x: number) => Math.round(x * 100);
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-14 shrink-0 tabular-nums text-muted">
        {p(bin.lower)}–{p(bin.upper)}
      </span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-border/50">
        {/* Sloupec = pozorovaná četnost; svislá značka = průměrná predikce (ideál = překryv). */}
        <div className={`bar-fill h-full ${barCls}`} style={{ width: `${observed * 100}%` }} />
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/70"
          style={{ left: `${predicted * 100}%` }}
          title={`Predikováno ${p(predicted)} %`}
        />
      </div>
      <span className="w-20 shrink-0 text-right tabular-nums text-foreground">
        {p(observed)}
        <span className="text-muted"> / {p(predicted)} %</span>
      </span>
      <span className="w-6 shrink-0 text-right tabular-nums text-muted">{bin.count}</span>
    </div>
  );
}

export function RuleControls({
  market,
  venue,
  minProb,
  valueOnly,
  hideUnready,
  onMarket,
  onVenue,
  onMinProb,
  onValueOnly,
  onHideUnready,
  onPreset,
}: {
  market: PickMarket;
  venue: Venue;
  minProb: number;
  valueOnly: boolean;
  hideUnready: boolean;
  onMarket: (m: PickMarket) => void;
  onVenue: (v: Venue) => void;
  onMinProb: (p: number) => void;
  onValueOnly: (v: boolean) => void;
  onHideUnready: (v: boolean) => void;
  onPreset: (rule: { market: PickMarket; venue: Venue; minProb: number }) => void;
}) {
  // Presety jsou vstupní bod pro laika; detailní ovládání je pro toho, kdo ví, co ladí.
  const [advanced, setAdvanced] = useState(false);
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Rychlá volba</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PICK_PRESETS.map((preset) => {
          const active =
            preset.rule.market === market &&
            preset.rule.venue === venue &&
            Math.abs(preset.rule.minProb - minProb) < 0.001;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPreset(preset.rule)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        className="mt-3 text-[11px] text-muted transition hover:text-foreground"
      >
        {advanced ? "▾" : "▸"} ⚙ Upravit pravidlo
      </button>

      {advanced && (
        <>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Trh</span>
          <select
            value={market}
            onChange={(e) => onMarket(e.target.value as PickMarket)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-base"
          >
            <option value="win">{MARKET_LABELS.win}</option>
            <option value="over25">{MARKET_LABELS.over25}</option>
            <option value="btts">{MARKET_LABELS.btts}</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Místo</span>
          <select
            value={venue}
            onChange={(e) => onVenue(e.target.value as Venue)}
            disabled={market !== "win"}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-base disabled:opacity-50"
          >
            <option value="home">Doma</option>
            <option value="away">Venku</option>
            <option value="any">Oboje</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Min. pravděpodobnost: {Math.round(minProb * 100)} %
          </span>
          <input
            type="range"
            min={0.5}
            max={0.9}
            step={0.05}
            value={minProb}
            onChange={(e) => onMinProb(Number(e.target.value))}
            className="mt-2 w-full"
          />
        </label>
      </div>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        {/* Filtr neshody s trhem: ponechá jen zápasy, kde je naše pravděpodobnost vyšší
            než FÉROVÁ (odmaržovaná) cena. Vědomě se to nejmenuje „value": měření ukázalo,
            že model trh neporazí a že větší neshoda vede k HORŠÍMU výsledku – je to tedy
            vodítko k prozkoumání, ne tip s hranou. Kurzy jsou jen u klubových lig blízko
            výkopu → mimo to prázdno. */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={valueOnly}
            onChange={(e) => onValueOnly(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm font-medium text-foreground">
            Jen kde se lišíme od trhu{" "}
            <span className="font-normal text-muted">(nad férovou cenou, bez marže)</span>
          </span>
        </label>
        {/* Varování patří k přepínači, ne jen do komentáře v kódu: bez něj to laik přečte
            jako „ukaž mi value sázky", ačkoli měření říká pravý opak. */}
        <p className="rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] leading-snug text-muted">
          <span aria-hidden>⚠ </span>
          Větší neshoda s trhem znamenala v backtestu <strong>horší</strong> výsledek
          (ROI −7,7 % → −8,9 %). Je to podnět k prozkoumání, ne výběr sázek.
        </p>
        {/* Readiness gate: skryje tipy s tenkým vzorkem (start sezóny). Default ON. */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hideUnready}
            onChange={(e) => onHideUnready(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm font-medium text-foreground">
            Skrýt málo dat <span className="font-normal text-muted">(jen predikce s dost zápasy)</span>
          </span>
        </label>
      </div>
        </>
      )}
    </section>
  );
}

/** Tvar odpovídá `ModelView`: jeden verdikt nahoře, pod ním tři karty kritérií. */
function ModelSkeleton() {
  return (
    <div className="mt-4 space-y-3">
      <div className="h-20 animate-pulse rounded-2xl bg-border/60" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-2xl bg-border/60"
          style={{ animationDelay: `${(i + 1) * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function PicksSkeleton() {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-xl bg-border/60"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}
