"use client";
import { ModelOnlyPanel } from './ModelOnlyPanel';
export function DailySelectionSummary({date,today,identity}:{date:string|null;today:string|null;identity:string}) {
 if(date && today && date>today) return <section className="ui-panel p-4"><h2>Denní modelový výběr</h2><p>Pro budoucí den ještě není hotový denní výběr. Předzápasové predikce najdeš v detailu zápasu.</p></section>;
 return date ? <ModelOnlyPanel initialDate={date} identity={identity} compact/> : null;
}
