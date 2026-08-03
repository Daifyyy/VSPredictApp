import { PrismaClient } from "@prisma/client";

// Singleton – brání vyčerpání spojení při hot-reloadu ve vývoji.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Je nakonfigurovaná reálná datová vrstva (API klíč + DB)? Jinak běží mock. */
export function isRealDataConfigured(): boolean {
  // Deterministický offline režim pro E2E, lokální demo a build bez DB/API. Je opt-in;
  // na Vercelu se reálná data použijí, dokud někdo proměnnou výslovně nenastaví.
  if (process.env.DATA_SOURCE === "mock") return false;
  return Boolean(process.env.API_FOOTBALL_KEY && process.env.DATABASE_URL);
}
