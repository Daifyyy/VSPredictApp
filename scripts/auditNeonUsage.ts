import { PrismaClient } from "@prisma/client";

async function main() {
const prisma = new PrismaClient();

const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string; rows: bigint; bytes: bigint }>>(`
  SELECT relname AS table_name, n_live_tup::bigint AS rows,
         pg_total_relation_size(relid)::bigint AS bytes
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 25
`);

let statements: Array<{ calls: bigint; rows: bigint; total_exec_time: number; query: string }> = [];
try {
  statements = await prisma.$queryRawUnsafe(`
    SELECT calls::bigint, rows::bigint, total_exec_time::float8,
           LEFT(query, 180) AS query
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    ORDER BY rows DESC
    LIMIT 25
  `);
} catch {
  // pg_stat_statements nemusí být pro daný projekt povolený; velikosti tabulek stačí
  // jako bezpečný základ auditu a skript kvůli tomu nemá selhat.
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  tables: tables.map((row) => ({ ...row, rows: Number(row.rows), bytes: Number(row.bytes) })),
  statements: statements.map((row) => ({ ...row, calls: Number(row.calls), rows: Number(row.rows) })),
}, null, 2));

await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
