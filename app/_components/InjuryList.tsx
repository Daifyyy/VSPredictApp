import type { Injury } from "@/lib/types";

/**
 * Seznam zraněných/absentujících hráčů jednoho týmu (jméno — důvod). Líně načítané,
 * nezávislé na přepínači Doma/Venku/Celkově (stav kádru). Prázdný seznam = nevykreslí se
 * (řeší rodič).
 */
export function InjuryList({
  title,
  accent,
  injuries,
}: {
  title: string;
  accent: "home" | "away";
  injuries: Injury[];
}) {
  const color = accent === "home" ? "text-home" : "text-away";
  return (
    <div className="ui-panel p-4">
      <p className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${color}`}>
        {title}
        <span className="font-normal text-muted">({injuries.length})</span>
      </p>
      <ul className="space-y-1 text-xs">
        {injuries.map((inj) => (
          <li key={`${inj.playerId}-${inj.name}`} className="flex items-center justify-between gap-2 border-t border-border/70 py-2 first:border-0">
            <span className="font-medium text-foreground">{inj.name}</span>
            <span className="flex shrink-0 items-center gap-2 text-right text-muted">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${absenceTone(inj.reason)}`}>{absenceLabel(inj.reason)}</span>
              {inj.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function absenceLabel(reason: string): string {
  const value = reason.toLocaleLowerCase("cs");
  if (/suspend|trest|karta/.test(value)) return "Trest";
  if (/ill|nemoc|virus/.test(value)) return "Nemoc";
  if (/injur|zran|sval|kolen|kotn|steh/.test(value)) return "Zranění";
  return "Absence";
}

function absenceTone(reason: string): string {
  const label = absenceLabel(reason);
  if (label === "Trest") return "bg-warning/10 text-warning";
  if (label === "Nemoc") return "bg-home/10 text-home";
  if (label === "Zranění") return "bg-negative/10 text-negative";
  return "bg-background text-muted";
}
