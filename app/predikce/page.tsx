import { PicksApp } from "../_components/PicksApp";

export const metadata = {
  title: "Predikce — Football Insight",
  description:
    "Které zápasy má statistický model za nejjistější a jak si zatím vede. Není to sázkové doporučení.",
};

export const dynamic = "force-static";

export default function PredikcePage() {
  return (
    <div className="flex-1">
      <PicksApp user={null} />
    </div>
  );
}
