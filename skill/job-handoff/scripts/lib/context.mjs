// 스크립트들이 같이 쓰는 준비 단계: 총괄 폴더 → 색인 → 업무 → 상태, 그리고 대시보드 업무 카드 갱신.
import path from 'node:path';
import { requireAbs } from './args.mjs';
import { ledgerPath, upsertJobCard } from './dashboard.mjs';
import { findJob, jobDir, lastLesson, loadIndex, loadState, saveIndex } from './job.mjs';
import { readText, requireJobId } from './util.mjs';

export const COMMON = { main: 'string', team: 'string', dashboard: 'string', now: 'string' };

export function openJob(options) {
  const main = requireAbs(options, 'main');
  const id = requireJobId(options.id);
  const entry = findJob(main, id);
  return { main, entry, state: loadState(entry), ledger: ledgerPath(options.dashboard) };
}

// 설명서 1절 첫 문장을 카드 요약으로 쓴다.
export function summaryOf(entry) {
  const text = readText(path.join(jobDir(entry), 'job.md'));
  const section = text.split('## 1.')[1]?.split('\n## ')[0] || '';
  return section.split('\n').slice(1).map(s => s.trim()).find(Boolean)?.slice(0, 200) || '';
}

export function publishCard(ledger, entry, state) {
  return upsertJobCard(ledger, { id: state.id, title: state.title, agent: state.agent, level: state.graduated ? 'L4' : state.level, lesson: lastLesson(entry), summary: summaryOf(entry) });
}

// 단계가 바뀌면 색인(INDEX.md)에도 적는다.
export function syncIndexLevel(main, state) {
  const index = loadIndex(main);
  const job = index.jobs.find(j => j.id === state.id);
  if (job && job.level !== state.level) { job.level = state.level; saveIndex(main, index); return index; }
  return null;
}
