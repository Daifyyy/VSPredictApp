import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export function requestDiagnostics(request: Request) {
  const started = performance.now();
  const requestId = request.headers.get("x-request-id")?.slice(0, 80) || randomUUID();
  return {
    requestId,
    json(body: unknown, init: ResponseInit = {}, timings: Record<string, number> = {}) {
      const total = performance.now() - started;
      const headers = new Headers(init.headers);
      headers.set("X-Request-Id", requestId);
      headers.set("Server-Timing", [...Object.entries(timings), ["total", total]].map(([name, value]) => `${name};dur=${Number(value).toFixed(1)}`).join(", "));
      if (process.env.AUDIT_MODE === "1") headers.set("X-Response-Bytes", String(Buffer.byteLength(JSON.stringify(body))));
      return NextResponse.json(body, { ...init, headers });
    },
  };
}
