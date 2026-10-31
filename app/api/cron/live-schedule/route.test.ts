import { expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => { throw Error('Retired schedule must not load DB'); });
import { GET } from './route';
it('does not rebuild a retired live schedule or expose fixture data', async () => {
 const response = GET();
 expect(response.status).toBe(410);
 expect(await response.json()).toEqual({ limitedReason: 'LIVE_RETIRED', message: 'Živý přenos byl ukončen. Použijte předzápasové predikce a konečné výsledky.' });
});
