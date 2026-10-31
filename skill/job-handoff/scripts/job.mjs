#!/usr/bin/env node
// 업무 설명서 새 판 저장. 이전 판은 versions/job.v<n>.md 로 남긴다. 배운 것 한 줄을 같이 적을 수 있다.
//   node job.mjs --main <dir> --id ad-log --file <새 설명서 절대경로> [--reason "되말하기 반영"] [--lesson "광고비는 VAT 빼고 기록"]
//   node job.mjs --main <dir> --id ad-log --show            (지금 설명서 읽기)
// 대표가 승인한 뒤에만 실행한다. 7개 절(## 1. ~ ## 7.)이 빠지면 경고, 1,500자를 넘으면 사례로 옮기자고 경고한다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { COMMON, openJob, publishCard } from './lib/context.mjs';
import { JOB_CHAR_LIMIT, JOB_SECTIONS, jobDir, saveState } from './lib/job.mjs';
import { redact } from './lib/redact.mjs';
import { atomicWrite, fail, kstDate, nowFrom, readText, runMain } from './lib/util.mjs';

const USAGE = 'node job.mjs --main <dir> --id <업무 id> (--file <설명서> [--reason <왜>] [--lesson <배운 것>] | --show)';

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string', file: 'string', reason: 'string', lesson: 'string', show: 'bool' }, USAGE);
  const { entry, state, ledger } = openJob(options);
  const dir = jobDir(entry);
  const target = path.join(dir, 'job.md');
  if (options.show) return { version: state.jobVersion, text: readText(target) };
  if (!options.file || !path.isAbsolute(options.file)) fail('--file(새 설명서 절대경로)이 필요해요');
  const now = nowFrom(options.now);
  const raw = fs.readFileSync(options.file, 'utf8');
  const { text, redacted } = redact(raw);
  if (!text.trim()) fail('설명서가 비어 있어요');
  const missing = JOB_SECTIONS.filter(h => !text.includes(h));
  const body = text.replace(/^#.*\n/, '');
  const chars = [...body.replace(/\s+/g, '')].length;

  const before = readText(target);
  if (before === text && !options.lesson) return { changed: false, version: state.jobVersion, message: '설명서가 그대로예요. 바꾼 곳이 없어요.' };
  if (before !== text) {
    if (before) atomicWrite(path.join(dir, 'versions', `job.v${state.jobVersion}.md`), before);
    atomicWrite(target, text);
    state.jobVersion += 1;
    state.events.push({ at: kstDate(now), kind: 'job', note: `설명서 v${state.jobVersion}${options.reason ? ` — ${redact(options.reason).text.slice(0, 120)}` : ''}` });
  }
  let lesson = null;
  if (options.lesson) {
    lesson = redact(options.lesson).text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (lesson) atomicWrite(path.join(dir, 'lessons.md'), `${readText(path.join(dir, 'lessons.md'))}- ${kstDate(now)} ${lesson} (설명서 v${state.jobVersion})\n`);
  }
  saveState(entry, state);
  const dashboard = publishCard(ledger, entry, state);
  const warnings = [];
  if (missing.length) warnings.push(`빠진 절: ${missing.join(' ')} — 인터뷰에서 그 질문을 다시 해 주세요`);
  if (chars > JOB_CHAR_LIMIT) warnings.push(`설명서가 ${chars}자예요(권장 ${JOB_CHAR_LIMIT}자). 예시·긴 설명은 cases/ 로 옮기자고 대표에게 제안하세요`);
  return {
    changed: before !== text,
    version: state.jobVersion,
    lesson,
    redacted,
    warnings,
    dashboard,
    message: `설명서를 ${state.jobVersion}판으로 고쳤어요.${lesson ? ` 배운 것: "${lesson}"` : ''} 다음부터 이대로 할게요.`,
  };
});
