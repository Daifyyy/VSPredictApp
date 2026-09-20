import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: { fixturePrediction: { findMany: vi.fn().mockResolvedValue([]) } } }));
import { prisma } from "@/lib/db";
import { getUnsettledPredictions } from "./predictionStore";
it("repairs stale live statuses after grace period, never selecting final states", async () => {
  await getUnsettledPredictions();
  const query = vi.mocked(prisma.fixturePrediction.findMany).mock.calls[0][0]!;
  expect(query).toMatchObject({ where: { status: { in: expect.arrayContaining(["1H", "HT", "2H", "ET", "P", "LIVE"]) }, kickoff: { lt: expect.any(Date) } } });
  expect((query.where!.status as {in: string[]}).in).not.toContain("FT");
});
