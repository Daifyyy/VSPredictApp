/** Retired routes remain explicit for old clients, without any service dependency. */
export function retiredLiveResponse() {
  return Response.json({ limitedReason: 'LIVE_RETIRED', message: 'Živý přenos byl ukončen. Použijte předzápasové predikce a konečné výsledky.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
