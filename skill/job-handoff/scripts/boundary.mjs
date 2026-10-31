#!/usr/bin/env node
// 묻기 규칙(boundary.md) 고치기. 대표 승인 뒤에만 실행한다.
//   node boundary.mjs --main <dir> --id ad-log --add "광고 끄기" --section ask|after|never
//   node boundary.mjs --main <dir> --id ad-log --move "광고 일지 기록" --to after     (먼저 묻기 → 하고 나서 보고 = 믿음이 쌓였다는 뜻, L3 조건)
//   node boundary.mjs --main <dir> --id ad-log --show
import path from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { COMMON, openJob } from './lib/context.mjs';
import { jobDir, saveState } from './lib/job.mjs';
import { redact } from './lib/redact.mjs';
import { atomicWrite, fail, kstDate, nowFrom, readText, runMain } from './lib/util.mjs';

const USAGE = 'node boundary.mjs --main <dir> --id <업무 id> (--add <항목> --section ask|after|never | --move <항목 일부> --to ask|after|never | --show)';
export const SECTIONS = { ask: '## 먼저 묻기', after: '## 하고 나서 보고', never: '## 절대 하지 않기' };
const NAMES = { ask: '먼저 묻기', after: '하고 나서 보고', never: '절대 하지 않기' };

export function parseBoundary(text) {
  const out = { ask: [], after: [], never: [] };
  let current = null;
  for (const line of text.split('\n')) {
    const key = Object.keys(SECTIONS).find(k => line.trim() === SECTIONS[k]);
    if (key) { current = key; continue; }
    if (current && line.startsWith('- ')) out[current].push(line.slice(2).trim());
  }
  return out;
}

export function renderBoundary(title, sections) {
  return `${title}\n\n${Object.keys(SECTIONS).map(k => `${SECTIONS[k]}\n${sections[k].map(i => `- ${i}`).join('\n')}${sections[k].length ? '\n' : ''}`).join('\n')}`;
}

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string', add: 'string', section: 'string', move: 'string', to: 'string', show: 'bool' }, USAGE);
  const { entry, state } = openJob(options);
  const file = path.join(jobDir(entry), 'boundary.md');
  const text = readText(file);
  const title = text.split('\n')[0] || `# 묻기 규칙 — ${state.title}`;
  const sections = parseBoundary(text);
  if (options.show) return { sections };
  const now = nowFrom(options.now);
  let note;
  let move = null;
  if (options.add) {
    const key = options.section;
    if (!SECTIONS[key]) fail('--section 은 ask | after | never');
    const item = redact(options.add.trim()).text.slice(0, 160);
    if (!item) fail('--add 내용이 비어 있어요');
    sections[key].push(item);
    note = `'${item}' → ${NAMES[key]}`;
  } else if (options.move) {
    const to = options.to;
    if (!SECTIONS[to]) fail('--to 는 ask | after | never');
    const matches = Object.keys(sections).flatMap(k => sections[k].map(i => ({ k, i }))).filter(x => x.i.includes(options.move.trim()));
    if (matches.length !== 1) fail(matches.length ? `'${options.move}'가 여러 줄에 있어요. 더 길게 적어 주세요` : `'${options.move}' 항목을 찾지 못했어요`);
    const [{ k: from, i: item }] = matches;
    if (from === to) fail(`이미 '${NAMES[to]}'에 있어요`);
    sections[from] = sections[from].filter(i => i !== item);
    sections[to].push(item);
    move = `${from}->${to}`;
    note = `'${item}' ${NAMES[from]} → ${NAMES[to]}`;
  } else fail(USAGE);
  atomicWrite(file, renderBoundary(title, sections));
  state.events.push({ at: kstDate(now), kind: 'boundary', note, ...(move ? { move } : {}) });
  saveState(entry, state);
  return {
    sections,
    move,
    message: move === 'ask->after'
      ? `이제 ${note.split(' 먼저 묻기')[0]}은 묻지 않고 하고 나서 보고할게요. 믿고 맡겨 주셔서 고마워요.`
      : `묻기 규칙을 고쳤어요: ${note}.`,
  };
});
