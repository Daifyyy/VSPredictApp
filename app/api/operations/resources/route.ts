import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authUser';
import { isAdminEmail } from '@/lib/entitlements';
import { readResourceBudget, saveResourceReading } from '@/lib/data/resourceBudgetStore';
import { validResourceSnapshot } from '@/lib/resourceBudget';

async function admin() {
  const user = await getCurrentUser();
  return Boolean(user?.email && isAdminEmail(user.email));
}
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  return NextResponse.json(await readResourceBudget(), { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: Request) {
  if (!(await admin())) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  // Small, same-origin administrative mutation, not a provider proxy.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'FORBIDDEN_ORIGIN' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 4096) return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }); }
  if (!validResourceSnapshot(value) || value.source !== 'MANUAL') return NextResponse.json({ error: 'INVALID_READING' }, { status: 400 });
  await saveResourceReading(value);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
