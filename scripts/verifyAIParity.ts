/** Explicit local parity and latency test. Never activates a candidate. */
import { readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { inferAI, AI_PROTOCOL, type AIModelArtifact } from '../lib/picks/aiResearch';

const root = realpathSync(resolve('.runtime/ai-research'));
const dir = realpathSync(resolve(process.argv[2] ?? 'INVALID'));
const rel = relative(root, dir);
if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('INVALID_LOCAL_RUN');
const raw = readFileSync(resolve(dir, 'candidate.for-parity.json'), 'utf8');
if (Buffer.byteLength(raw) > AI_PROTOCOL.maxArtifactBytes) throw Error('ARTIFACT_TOO_LARGE');
const a = JSON.parse(raw) as AIModelArtifact;
const cases = JSON.parse(readFileSync(resolve(dir, 'parity.json'), 'utf8')) as Array<{ values: Array<number | null>; expected: number[] }>;
if (cases.length < 1) throw Error('MISSING_PARITY_CASES');
let maxError = 0;
const elapsed: number[] = [];
for (let repeat = 0; repeat < 11; repeat++) for (const c of cases) {
  const start = performance.now();
  const p = inferAI(a, c.values, { parityOnly: true });
  if (repeat > 0) elapsed.push(performance.now() - start);
  if (p.length !== c.expected.length) throw Error('PARITY_DIMENSION');
  p.forEach((v, i) => { maxError = Math.max(maxError, Math.abs(v - c.expected[i])); });
}
elapsed.sort((a, b) => a - b);
const p95Ms = elapsed[Math.ceil(elapsed.length * .95) - 1];
const report = { version: 1, cases: cases.length, maxError, tolerance: 1e-6, p95Ms, artifactBytes: Buffer.byteLength(raw),
  parityPassed: Number.isFinite(maxError) && maxError <= 1e-6, latencyPassed: p95Ms <= 25, activation: false };
const output = resolve(dir, 'runtime-parity.json');
if (existsSync(output)) throw Error('PARITY_REPORT_EXISTS');
writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
if (!report.parityPassed || !report.latencyPassed) process.exitCode = 1;
