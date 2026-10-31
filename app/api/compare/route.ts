/** Free-form comparison is retired; original model calculations remain in prediction jobs. */
export function GET() {
 return Response.json({ limitedReason: 'FREE_COMPARE_RETIRED', error: 'Vyberte konkrétní zápas v Programu. Volné porovnávání klubů bylo ukončeno.' },
   { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
