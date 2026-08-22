import type { DirectorChoice } from "./types";
import { hashSeed, pick, seeded } from "./random";

export interface WorldContext {
  seed: number;
  day: number;
  clubName: string;
  coachName: string;
  playerName: string;
  cash: number;
  boardTrust: number;
  fanTrust: number;
  recentTemplates: string[];
  ethicsMode: string;
  weakPositionUrgency?: number;
  unhappyPlayer?: boolean;
  attendance?: number;
  activeProject?: boolean;
  activeNegotiation?: boolean;
  cashPressure?: boolean;
}

interface StoryTemplate {
  id: string;
  category: string;
  severity: "INFO" | "DECISION" | "CRISIS";
  cooldown: number;
  eligible(ctx: WorldContext): boolean;
  titles: string[];
  bodies: ((ctx: WorldContext) => string)[];
  choices(ctx: WorldContext): DirectorChoice[];
  tags: string[];
}

const choice = (key: string, label: string, detail: string, effects: DirectorChoice["effects"]): DirectorChoice => ({ key, label, detail, effects });

const TEMPLATES: StoryTemplate[] = [
  {
    id: "coach-recruitment-priority", category: "COACH", severity: "DECISION", cooldown: 18,
    eligible: (c) => c.day > 1 && (c.weakPositionUrgency ?? 0) >= 55,
    titles: ["Trenér žádá konkrétní profil", "Sportovní plán potřebuje posilu", "Schůzka nad skladbou kádru"],
    bodies: [(c) => `${c.coachName} chce před dalším obdobím získat rychlého hráče do přechodu. Nežádá konkrétní jméno, ale závazek, že tato role dostane prioritu.`, (c) => `${c.coachName} upozorňuje, že kádr ${c.clubName} neodpovídá jeho herní filozofii. Žádá prostor pro cílenou posilu.`],
    choices: () => [choice("promise", "Přijmout prioritu", "Vznikne závazek vůči trenérovi.", { coachRelationship: 4 }), choice("data", "Vyžádat datové srovnání", "Rozhodnutí odložíš, vztah zůstane neutrální.", {}), choice("reject", "Odmítnout zásah do plánu", "Chráníš rozpočet, ale trenér ztratí část důvěry.", { coachRelationship: -5, boardTrust: 1 })], tags: ["coach", "promise", "transfer"],
  },
  {
    id: "player-playing-time", category: "SQUAD", severity: "DECISION", cooldown: 16,
    eligible: (c) => c.day > 2 && Boolean(c.unhappyPlayer),
    titles: ["Hráč chce jasnější roli", "Nespokojenost s herním časem", "Agent žádá schůzku"],
    bodies: [(c) => `Agent hráče ${c.playerName} chce vědět, zda s ním klub dlouhodobě počítá. Veřejný spor zatím nehrozí, ale neurčitá odpověď problém pouze odloží.`, (c) => `${c.playerName} se přes kapitána dotazuje na svou budoucnost. Trenér mu pravidelné místo slíbit nechce.`],
    choices: () => [choice("honest", "Popsat situaci otevřeně", "Nižší okamžitá morálka, vyšší důvěryhodnost.", { mediaCredibility: 2 }), choice("promise", "Slíbit větší prostor", "Vznikne měřitelný závazek na další zápasy.", { publicTrust: 1 }), choice("market", "Povolit hledání nového klubu", "Otevřeš cestu k přestupu.", { fanTrust: -1 })], tags: ["player", "promise", "agent"],
  },
  {
    id: "supporters-ticket-prices", category: "FANS", severity: "DECISION", cooldown: 30,
    eligible: (c) => c.day > 3 && (c.attendance ?? 0) >= .68,
    titles: ["Rada fanoušků řeší vstupné", "Jednání se zástupci tribun", "Permanentkáři žádají jistotu"],
    bodies: [(c) => `Zástupci fanoušků ${c.clubName} chtějí před zveřejněním ceníku garantovat dostupný sektor pro dlouholeté permanentkáře. Finance doporučují plošné zvýšení cen.`, () => `Aktivní jádro žádá zmrazení cen. Komerční oddělení tvrdí, že současná poptávka umožňuje zdražení bez poklesu návštěvnosti.`],
    choices: () => [choice("freeze", "Zmrazit ceny", "Menší příjem, silnější vztah s tribunou.", { cash: -80_000, fanTrust: 5, publicTrust: 2 }), choice("targeted", "Zvýšit jen prémiové sektory", "Kompromis mezi příjmem a dostupností.", { cash: 60_000, fanTrust: 1 }), choice("raise", "Zvýšit ceny plošně", "Vyšší příjem, riziko protestu.", { cash: 180_000, fanTrust: -6, boardTrust: 2 })], tags: ["fans", "finance", "promise"],
  },
  {
    id: "stadium-study", category: "STADIUM", severity: "DECISION", cooldown: 35,
    eligible: (c) => c.day > 4 && c.cash > 500_000 && !c.activeProject,
    titles: ["Studie budoucnosti stadionu", "Areál potřebuje strategické rozhodnutí", "První krok k modernizaci"],
    bodies: [(c) => `Technický ředitel nabízí tři směry rozvoje stadionu ${c.clubName}: atmosféru, komerční prostory nebo zázemí akademie. Studie sama o sobě klub k výstavbě nezaváže.`, () => `Město je připravené jednat o rozvoji areálu. Nejdřív ale požaduje jasně zvolenou prioritu klubu.`],
    choices: () => [choice("atmosphere", "Prověřit tribunu a kotel", "Prioritou bude atmosféra a fanoušci.", { cash: -120_000, fanTrust: 3 }), choice("commercial", "Prověřit komerční část", "Prioritou budou dlouhodobé příjmy.", { cash: -120_000, boardTrust: 2 }), choice("academy", "Prověřit akademii", "Prioritou bude rozvoj hráčů.", { cash: -120_000, publicTrust: 2 })], tags: ["stadium", "project", "finance"],
  },
  {
    id: "media-philosophy", category: "MEDIA", severity: "DECISION", cooldown: 14,
    eligible: (c) => c.day > 1,
    titles: ["Novináři se ptají na identitu klubu", "Veřejnost čeká vysvětlení", "Jaký klub chcete vybudovat?"],
    bodies: [(c) => `Lokální reportér se ptá, podle čeho bude vedení ${c.clubName} posuzovat úspěch: výsledků, financí, nebo rozvoje mladých hráčů.`, () => `Po několika rozdílných rozhodnutích chce veřejnost slyšet, jaká je skutečná sportovní filozofie klubu.`],
    choices: () => [choice("results", "Rozhodují výsledky", "Zvyšuješ očekávání majitele i médií.", { boardTrust: 2, publicTrust: -1 }), choice("sustainable", "Udržitelný růst", "Opatrná a důvěryhodná dlouhodobá pozice.", { mediaCredibility: 3 }), choice("academy", "Stavíme na akademii", "Fanoušci výrok ocení; vzniká veřejný závazek.", { fanTrust: 3, publicTrust: 2 })], tags: ["media", "identity", "promise"],
  },
  {
    id: "sponsor-controversy", category: "ETHICS", severity: "CRISIS", cooldown: 50,
    eligible: (c) => c.ethicsMode !== "OFF" && c.day > 8 && Boolean(c.cashPressure),
    titles: ["Lukrativní, ale kontroverzní partner", "Rada řeší původ peněz", "Sponzorská nabídka rozděluje klub"],
    bodies: [(ctx) => `Nový partner nabízí ${ctx.clubName} výrazně nadstandardní smlouvu. Právní prověrka neodhalila porušení zákona, ale obchodní praktiky firmy vyvolávají veřejné otázky.`],
    choices: () => [choice("reject", "Nabídku odmítnout", "Chráníš identitu, vzdáváš se příjmu.", { boardTrust: -2, fanTrust: 6, mediaCredibility: 4 }), choice("conditions", "Požadovat etické podmínky", "Mírnější příjem, kontrolní mechanismy a nejistý výsledek.", { cash: 220_000, boardTrust: 1, publicTrust: 1 }), choice("accept", "Smlouvu přijmout", "Výrazný příjem a dlouhodobá reputační stopa.", { cash: 700_000, boardTrust: 4, fanTrust: -8, mediaCredibility: -5 })], tags: ["ethics", "sponsor", "grey-zone"],
  },
  {
    id: "information-leak", category: "ETHICS", severity: "DECISION", cooldown: 24,
    eligible: (c) => c.ethicsMode !== "OFF" && c.day > 5 && Boolean(c.activeNegotiation),
    titles: ["Nabídka zákulisního úniku", "Agent navrhuje veřejný tlak", "Citlivá informace může změnit jednání"],
    bodies: [() => `Prostředník nabízí, že nenápadně zveřejní konkurenční zájem o hráče. Mohlo by to urychlit jednání, ale trenér ani protistrana o této taktice nevědí.`],
    choices: () => [choice("refuse", "Únik odmítnout", "Jednání zůstane čisté a vztahy bezpečné.", { mediaCredibility: 2 }), choice("brief", "Informovat jen důvěryhodného novináře", "Vzniká kontrolované, ale stále rizikové zákulisní jednání.", { publicTrust: -1 }), choice("leak", "Dovolit prostředníkovi jednat", "Krátkodobý tlak, dlouhodobá stopa.", { coachRelationship: -3, mediaCredibility: -4 })], tags: ["ethics", "media", "grey-zone"],
  },
  {
    id: "board-cost-review", category: "BOARD", severity: "DECISION", cooldown: 22,
    eligible: (c) => c.boardTrust < 72 && Boolean(c.cashPressure),
    titles: ["Rada žádá úsporný plán", "Náklady klubu pod drobnohledem", "Majitel chce finanční rezervu"],
    bodies: [(c) => `Rada ${c.clubName} požaduje, aby vedení vytvořilo větší rezervu. Sportovní úsek se obává, že škrty poškodí konkurenceschopnost.`],
    choices: () => [choice("sport", "Chránit sportovní rozpočet", "Vyšší ambice, nižší důvěra rady.", { boardTrust: -3, publicTrust: 2 }), choice("balanced", "Předložit postupné úspory", "Bez výrazného okamžitého dopadu.", { boardTrust: 2 }), choice("cuts", "Přijmout rychlé škrty", "Posílíš rezervu, ale zhoršíš atmosféru.", { cash: 250_000, boardTrust: 5, publicTrust: -3 })], tags: ["board", "finance"],
  },
];

export function buildStory(ctx: WorldContext) {
  const rand = seeded(hashSeed(ctx.seed, ctx.day, "story"));
  const eligible = TEMPLATES.filter((t) => t.eligible(ctx) && !ctx.recentTemplates.includes(t.id));
  const pool = eligible.length ? eligible : TEMPLATES.filter((t) => t.eligible(ctx));
  const template = pick(pool, rand);
  return {
    templateId: template.id, category: template.category, severity: template.severity,
    title: pick(template.titles, rand), body: pick(template.bodies, rand)(ctx), choices: template.choices(ctx),
    dueDay: ctx.day + (template.severity === "CRISIS" ? 1 : 3), memoryTags: template.tags,
  };
}

export function openingStories(ctx: WorldContext) {
  return [
    {
      templateId: "welcome-board", category: "BOARD", severity: "DECISION", title: "První jednání s klubovou radou",
      body: `Rada ${ctx.clubName} chce slyšet, čím začne nová sportovní éra. Volba neurčí jedinou správnou cestu, ale vytvoří první veřejný závazek.`, dueDay: 2,
      memoryTags: ["board", "identity", "promise"],
      choices: [choice("stability", "Stabilizovat finance a kádr", "Bezpečnější start a důvěra rady.", { boardTrust: 4 }), choice("academy", "Otevřít cestu mladým", "Fanoušci získají konkrétní očekávání.", { fanTrust: 4, publicTrust: 2 }), choice("ambition", "Okamžitě zvýšit ambice", "Větší tlak na výsledky a vyšší veřejné očekávání.", { publicTrust: 3, boardTrust: -1 })],
    },
    {
      templateId: "welcome-supporters", category: "FANS", severity: "INFO", title: "Fanoušci vítají nové vedení",
      body: `Na Football Pulse převládá opatrný optimismus. Příznivci ${ctx.clubName} očekávají, že nové vedení bude své kroky vysvětlovat.`, dueDay: null, memoryTags: ["fans", "pulse"], choices: [],
    },
  ];
}

export function pulseForStory(story: { category: string; title: string }, clubName: string, day: number, seed: number) {
  const rand = seeded(hashSeed(seed, day, story.title, "pulse"));
  const reactions = [
    { authorType: "REPORTER", authorName: "Klubový reportér", tone: "ANALYTICAL", body: `${story.title}. Vedení ${clubName} bude muset ukázat, zda za slovy následuje konkrétní plán.`, trust: 78, reach: 4200 },
    { authorType: "SUPPORTERS", authorName: "Hlas tribuny", tone: "EMOTIONAL", body: `Nechceme fráze. U ${clubName} budeme hodnotit hlavně činy a dodržené sliby.`, trust: 61, reach: 7600 },
    { authorType: "ANALYST", authorName: "Data na trávníku", tone: "NEUTRAL", body: `${clubName} otevírá téma „${story.title.toLowerCase()}“. Důležitý bude dopad na kádr, finance a dlouhodobou stabilitu.`, trust: 84, reach: 3100 },
  ];
  return pick(reactions, rand);
}

export const ACHIEVEMENTS = {
  firstDay: { key: "FIRST_DAY", title: "Klíče od kanceláře", description: "Dokončil jsi první den ve funkci klubového ředitele.", rarity: "COMMON" },
  cleanHands: { key: "CLEAN_HANDS", title: "Čisté ruce", description: "Odmítl jsi první zákulisní zkratku.", rarity: "RARE" },
  supporterVoice: { key: "SUPPORTER_VOICE", title: "Klub naslouchá", description: "Upřednostnil jsi vztah s fanoušky před okamžitým výnosem.", rarity: "UNCOMMON" },
} as const;

