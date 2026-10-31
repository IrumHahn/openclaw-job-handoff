#!/usr/bin/env node
// 사례 저장: 대표가 실제로 했던 결과물 1건 = 입력 · 대표의 판단과 이유 · 결과. 재현 시험의 문제가 된다.
//   node case.mjs --main <dir> --id ad-log --title "11/3 광고 일지" (--input <…>|--input-file <f>) (--judgment <…>|--judgment-file <f>) (--output <…>|--output-file <f>)
//   node case.mjs --main <dir> --id ad-log --list
// 판단 이유가 비어 있으면 저장하지 않는다 — "이때는 왜 이렇게 하셨어요?"를 먼저 묻는다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { COMMON, openJob } from './lib/context.mjs';
import { jobDir } from './lib/job.mjs';
import { redact } from './lib/redact.mjs';
import { atomicWrite, fail, runMain, textOption } from './lib/util.mjs';

const USAGE = 'node case.mjs --main <dir> --id <업무 id> (--title <제목> --input[-file] … --judgment[-file] … --output[-file] … | --list)';

runMain(() => {
  const spec = { ...COMMON, id: 'string', title: 'string', list: 'bool' };
  for (const name of ['input', 'judgment', 'output']) { spec[name] = 'string'; spec[`${name}-file`] = 'string'; }
  const options = parseArgs(process.argv.slice(2), spec, USAGE);
  const { entry } = openJob(options);
  const dir = path.join(jobDir(entry), 'cases');
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.md')).sort() : [];
  if (options.list) return { count: existing.length, cases: existing.map(n => ({ file: n, title: fs.readFileSync(path.join(dir, n), 'utf8').split('\n')[0].replace(/^#\s*/, '') })) };

  const title = String(options.title || '').trim().slice(0, 80);
  if (!title) fail('--title 이 필요해요');
  const parts = {};
  let redacted = false;
  for (const name of ['input', 'judgment', 'output']) {
    const r = redact(textOption(options, name).trim());
    parts[name] = r.text;
    redacted ||= r.redacted;
  }
  if (!parts.judgment) fail('대표님의 판단과 이유가 비어 있어요. "이때는 왜 이렇게 하셨어요?"를 먼저 여쭤봐 주세요', 2);
  if (!parts.input && !parts.output) fail('입력이나 결과 중 하나는 있어야 해요');
  const number = String(existing.length + 1).padStart(2, '0');
  const file = path.join(dir, `${number}.md`);
  atomicWrite(file, `# 사례 ${number} — ${title}\n\n## 입력 (무엇을 보고 했나)\n${parts.input || '(없음)'}\n\n## 대표의 판단과 이유\n${parts.judgment}\n\n## 결과\n${parts.output || '(없음)'}\n`);
  const count = existing.length + 1;
  return {
    case: number,
    count,
    redacted,
    message: `사례 ${count}개째를 저장했어요.${count < 3 ? ` ${3 - count}개 더 있으면 좋아요.` : ' 이제 담당 직원이 되말하기를 할 차례예요.'}`,
  };
});
