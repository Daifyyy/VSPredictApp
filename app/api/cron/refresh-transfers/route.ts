/** Retired: no provider, database or dataset import on old URLs. */
export function GET() {
  return Response.json({ limitedReason: 'TRANSFERS_RETIRED', message: 'Přestupy nejsou součástí predikční aplikace.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
