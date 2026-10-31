import { retiredLiveResponse } from '@/lib/retiredLive';

/** Compatibility endpoint: no database access, provider request or watch mutation. */
export function GET() { return retiredLiveResponse(); }
export function POST() { return retiredLiveResponse(); }
