/** Reads an existing bounded export. No database or provider dependency. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { auditFrozenMarkets, type FrozenSignalRow } from "../lib/picks/frozenMarketAudit";
const path=".runtime/strategy-audit/evidence.json";
const raw=readFileSync(path,"utf8"),data=JSON.parse(raw) as {asOf:string;signals:FrozenSignalRow[]};
const report={...auditFrozenMarkets(data.signals,data.asOf),source:path,sha256:createHash("sha256").update(raw).digest("hex"),limitations:[
  "Existing export cutoff, not current production state.",
  "1X2 contains only selected-side binary probabilities, not a complete multinomial forecast.",
  "No raw complete quote or bookmaker identity in this export for these legacy rows; benchmark provenance is incomplete.",
  "Fixture outcomes joined by provider ID; frozen team IDs absent. Historical identity corrections cannot be fully audited.",
  "Descriptive paired comparison, not untouched holdout, CLV, executable ROI or proof of edge. No activation.",
]};
mkdirSync(".runtime/frozen-market-audit",{recursive:true});
const output=`.runtime/frozen-market-audit/${new Date().toISOString().replaceAll(":","-")}.json`;
writeFileSync(output,JSON.stringify(report,null,2),{flag:"wx"});
console.log(JSON.stringify({output,...report},null,2));
