// Keep upstream findings visible without allowing new file/rule/severity counts.
// Do not regenerate this baseline to make a failing change pass.
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { ESLint } from 'eslint';

const baseline = JSON.parse(await readFile(new URL('./lint-baseline.json', import.meta.url), 'utf8'));
const key = ({ file, rule, severity }) => JSON.stringify([file, rule, severity]);
const limits = new Map(baseline.findings.map(item => [key(item), item.count]));
const counts = new Map();
const eslint = new ESLint();
const results = await eslint.lintFiles(['.']);
const unexpected = [];
for (const result of results) {
  const file = relative(process.cwd(), result.filePath).replaceAll('\\', '/');
  for (const message of result.messages) {
    const id = key({ file, rule: message.ruleId, severity: message.severity });
    const count = (counts.get(id) ?? 0) + 1;
    counts.set(id, count);
    if (count > (limits.get(id) ?? 0)) unexpected.push({ ...result, messages: [message] });
  }
}
if (unexpected.length) {
  console.error((await eslint.loadFormatter('stylish')).format(unexpected));
  process.exitCode = 1;
} else {
  const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
  const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
  console.log(`Known upstream lint findings: ${errors} errors, ${warnings} warnings. No increases.`);
}
