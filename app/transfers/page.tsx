import { TransfersApp } from "../_components/TransfersApp";
import { getLeagues } from "@/lib/data/repository";
import { TRANSFER_LEAGUES } from "@/lib/data/transfers";

export const metadata = {
  title: "Přestupy — Football Insight",
  description: "Aktuální přestupy top-5 evropských lig a bilance klubů (PRO).",
};

export const dynamic = "force-static";

export default function TransfersPage() {

  // Jen top-5 ligy, které v daném režimu existují (mock = jen 39/140).
  const leagues = getLeagues()
    .filter((l) => TRANSFER_LEAGUES.includes(l.id))
    .map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="flex-1">
      <TransfersApp user={null} leagues={leagues} />
    </div>
  );
}
