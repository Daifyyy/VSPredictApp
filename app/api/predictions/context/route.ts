import { getCurrentUser } from '@/lib/authUser';
import { isAdminEmail } from '@/lib/entitlements';
import { readMatchContext } from '@/lib/data/matchContextStore';
import { allowRequest, clientKey, tooMany } from '@/lib/rateLimit';
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('fixture') ?? '';
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'INVALID_FIXTURE' }, { status: 400 });
  if (!allowRequest(`match-context:${clientKey(request)}`,30,60_000)) return tooMany();
  const user = await getCurrentUser();
  try { return Response.json(await readMatchContext(id,user?.tier === 'PRO' || isAdminEmail(user?.email)), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return Response.json({ reason: 'CONTEXT_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }); }
}
