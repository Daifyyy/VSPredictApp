import { NextResponse } from "next/server";

/** Odmítne browserové cross-site mutace; serverové volání bez Origin zůstává možné. */
export function rejectCrossSiteMutation(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Nepovolený původ požadavku" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try { if (new URL(origin).origin !== new URL(request.url).origin) return NextResponse.json({ error: "Nepovolený původ požadavku" }, { status: 403 }); }
  catch { return NextResponse.json({ error: "Neplatný původ požadavku" }, { status: 400 }); }
  return null;
}
