/** Retired product functionality. No database, provider calls or registration. */
export function GET() { return Response.json({ reason: 'MODEL_ONLY_MODE' }, { status: 410 }); }
export const POST = GET;
export const DELETE = GET;
