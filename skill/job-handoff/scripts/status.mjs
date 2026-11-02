#!/usr/bin/env node
// 수습 현황: 업무마다 담당 · 단계 · 진행 · 채점 안 한 결과 · 최근 배운 것.
//   node status.mjs --main <dir> [--id ad-log]
import { parseArgs, requireAbs } from './lib/args.mjs';
import { COMMON } from './lib/context.mjs';
import { LEVEL_NAMES, eligibility, findJob, lastLesson, loadIndex, loadState } from './lib/job.mjs';
import { requireJobId, runMain } from './lib/util.mjs';

const USAGE = 'node status.mjs --main <dir> [--id <업무 id>]';

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string' }, USAGE);
  const main = requireAbs(options, 'main');
  const entries = options.id ? [findJob(main, requireJobId(options.id))] : loadIndex(main).jobs;
  const jobs = entries.map(entry => {
    const state = loadState(entry);
    const check = eligibility(state);
    return {
      id: entry.id, title: state.title, agent: state.agent,
      level: state.graduated ? '수료' : state.level, levelName: state.graduated ? '' : LEVEL_NAMES[state.level],
      progress: check.progress, eligible: check.eligible,
      ungraded: state.events.filter(e => e.ref && !e.grade).map(e => ({ ref: e.ref, title: e.title, date: e.date })),
      lesson: lastLesson(entry), jobVersion: state.jobVersion, baseline: state.baseline ?? null,
    };
  });
  const lines = jobs.map(j => `• ${j.title} — ${j.agent}, ${j.level}${j.levelName ? ` ${j.levelName}` : ''} (${j.progress})${j.ungraded.length ? `, 채점 기다리는 것 ${j.ungraded.length}건` : ''}${j.eligible ? ', 승급 조건 충족!' : ''}${j.baseline ? `, 직접 하면 ${j.baseline.minutes}분` : ', 기준 시간 없음'}`);
  return {
    jobs,
    message: jobs.length ? `수습 현황이에요.\n${lines.join('\n')}` : '아직 수습 중인 업무가 없어요. "○○에게 △△ 업무 인수인계 시작해"라고 말해 주세요.',
  };
});
