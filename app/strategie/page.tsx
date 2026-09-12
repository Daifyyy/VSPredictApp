import { Suspense } from "react";
import { StrategyHub } from "../_components/StrategyHub";

export const metadata = {
  title: "Sázkové strategie — Football Insight",
  description: "Oddělená bilance, denní příležitosti a tikety sledovaných fotbalových strategií.",
};

export const dynamic = "force-static";

export default function StrategiePage() {
  return <div className="flex-1"><Suspense fallback={null}><StrategyHub /></Suspense></div>;
}
