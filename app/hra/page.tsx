import { DirectorApp } from "../_components/DirectorApp";
import { getCurrentUser } from "@/lib/authUser";
import type { SessionUser } from "../_components/sessionUser";

export const metadata = {
  title: "Klubový ředitel — Football Insight",
  description:
    "Živý svět klubového a sportovního ředitele: kádr, trenér, finance, stadion, fanoušci a média.",
};

export default async function HraPage() {
  const cu = await getCurrentUser();
  const user: SessionUser | null = cu
    ? {
        id: cu.id,
        name: cu.name,
        image: cu.image,
        tier: cu.tier,
        proTrialUsed: cu.proTrialUsed,
      }
    : null;
  return (
    <div className="flex-1">
      <DirectorApp user={user} />
    </div>
  );
}
