// 직원의 AGENTS.md 에 "수습 업무 — 설명서 먼저" 구역을 넣는다(표시 사이만 고친다, 멱등, 처음 고칠 때 백업).
// 담당 직원: 맡은 업무 목록과 설명서 위치. 총괄: 수습 명령을 받는 법.
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, fail, readText } from './util.mjs';
import { LEVEL_NAMES } from './job.mjs';

export const BLOCK_START = '<!-- job-handoff-hook:start -->';
export const BLOCK_END = '<!-- job-handoff-hook:end -->';
const BLOCK_PATTERN = new RegExp(`\\n?${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`);

export function memberHook(jobs, main) {
  const lines = jobs.map(j => `- ${j.title} (${j.id}, 지금 ${j.level || 'L0'} ${LEVEL_NAMES[j.level || 'L0']}): \`jobs/${j.id}/job.md\` · 묻기 규칙 \`jobs/${j.id}/boundary.md\` · 사례 \`jobs/${j.id}/cases/\``);
  return `## 수습 업무 — 일하기 전에 설명서 먼저

나는 아래 업무를 수습 중이다. 이 업무를 할 때는 **먼저 그 업무의 설명서와 묻기 규칙을 읽고, 설명서대로** 한다. 설명서에 없는 갈림길을 만나면 짐작하지 말고 묻는다.
${lines.join('\n')}
일을 마치면 \`job-handoff\` 스킬 4절대로 보고를 기록한다(스크립트의 \`--main\` 은 총괄 작업 폴더 \`${main}\`). 이 업무에서 받은 채점·교정은 \`job-handoff\` 절차로 설명서에 반영하고, **성장 노트(self-improve)에는 메모하지 않는다.** 설명서·묻기 규칙·채점표는 직접 고치지 않는다(스킬 스크립트만).`;
}

export const MAIN_HOOK = `## 수습 업무 — 총괄이 맡는 일

주인이 "○○에게 △△ 업무 인수인계 시작해", "수습 현황 보여 줘", "대시보드 채점 가져와", "승급시켜 줘"라고 하거나 \`[채점] … (id report:…)\` 문장을 붙여 넣으면 \`job-handoff\` 스킬 절차대로 처리한다. 인터뷰는 7문항을 한 번에 하나씩 묻는다. 수습 업무의 채점·교정은 성장 노트가 아니라 업무 설명서로 간다.`;

export function upsertBlock(text, content) {
  const block = `${BLOCK_START}\n${content.trim()}\n${BLOCK_END}`;
  if (text.includes(BLOCK_START)) return text.replace(BLOCK_PATTERN, m => `${m.startsWith('\n') ? '\n' : ''}${block}\n`);
  const separator = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${separator}${block}\n`;
}
export function removeBlock(text) { return text.replace(BLOCK_PATTERN, ''); }
function broken(text) { const s = text.indexOf(BLOCK_START); return s !== -1 && text.indexOf(BLOCK_END, s) === -1; }

function writeAgents(workspace, transform) {
  const target = path.join(workspace, 'AGENTS.md');
  const before = readText(target);
  if (broken(before)) fail(`AGENTS.md 의 수습 구역 끝 표시가 없어요. 고치지 않았어요: ${target}`, 4);
  const after = transform(before);
  if (after === before) return { target, changed: false };
  const backup = `${target}.job-handoff.bak`;
  if (before && !fs.existsSync(backup)) fs.writeFileSync(backup, before);
  atomicWrite(target, after);
  return { target, changed: true };
}

// 색인 전체를 보고 총괄과 담당 직원들의 구역을 다시 쓴다. 업무가 없어진 직원은 구역을 뺀다.
export function refreshHooks(main, index, { remove = false } = {}) {
  // 경로는 실제 경로로 맞춘다(심볼릭 링크 폴더에서 총괄 = 담당일 때 구역이 두 번 써지지 않게).
  const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const byWorkspace = new Map();
  for (const job of index.jobs) {
    const key = real(job.workspace);
    if (!byWorkspace.has(key)) byWorkspace.set(key, []);
    byWorkspace.get(key).push(job);
  }
  const results = [];
  const mainReal = real(main);
  const workspaces = new Set([mainReal, ...byWorkspace.keys(), ...(index.hooked || []).map(real)]);
  for (const workspace of workspaces) {
    if (!fs.existsSync(workspace)) { results.push({ workspace, skipped: 'workspace missing' }); continue; }
    const jobs = byWorkspace.get(workspace) || [];
    const parts = [];
    if (workspace === mainReal) parts.push(MAIN_HOOK);
    if (jobs.length) parts.push(memberHook(jobs, mainReal));
    const result = writeAgents(workspace, text => (remove || !parts.length ? removeBlock(text) : upsertBlock(text, parts.join('\n\n'))));
    results.push({ workspace, changed: result.changed });
  }
  index.hooked = remove ? [] : [...workspaces].filter(w => w === mainReal || byWorkspace.has(w));
  return results;
}
