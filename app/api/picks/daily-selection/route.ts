import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { localDateKey } from "@/lib/competitionGrouping";
import { isDateKey } from "@/lib/picks/strategyHub";
import { dailySelectionConfig } from "@/lib/dailySelectionConfig";
import { readDailySelection } from "@/lib/data/dailySelectionStore";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!dailySelectionConfig().ui) return NextResponse.json({error:"DISABLED"},{status:404});
  if (!allowRequest(`daily-selection:${clientKey(request)}`,60,60_000)) return tooMany();
  const date=new URL(request.url).searchParams.get("date")??localDateKey(new Date());
  if (!isDateKey(date)||date>localDateKey(new Date())) return NextResponse.json({error:"Neplatné nebo budoucí datum."},{status:400});
  try {
    const pro=getEntitlement(await getCurrentUser()).pro;
    return NextResponse.json(await readDailySelection(date,pro),{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    logError("api/picks/daily-selection",error,{date});
    return NextResponse.json({error:"Denní výběr se nepodařilo načíst."},{status:503});
  }
}
