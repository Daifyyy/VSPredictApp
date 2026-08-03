import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Zpětná kompatibilita: starý sdílený odkaz na porovnání `/?home=&away=` přesměruj na
 * novou cestu `/porovnani?…` (zachová sdílení i OG kartu). Domovská stránka díky tomu
 * nemusí číst `searchParams` a zůstává statická (ISR).
 */
export function proxy(req: NextRequest): NextResponse {
  const { searchParams } = req.nextUrl;
  if (searchParams.has("home") && searchParams.has("away")) {
    const url = req.nextUrl.clone();
    url.pathname = "/porovnani";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Proxy běží jen na domovské cestě, ne nad API ani statickými soubory.
export const config = { matcher: "/" };
