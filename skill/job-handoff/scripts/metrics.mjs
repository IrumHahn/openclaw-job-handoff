#!/usr/bin/env node
// 성과 측정: 업무별 주간 숫자를 계산해 대시보드 장부에 올린다. --weekly 면 일요일 성적표 문장을 message 로 낸다.
//   node metrics.mjs --main <dir> [--id ad-log] [--weekly]
// 숫자는 채점 기록에서만 나온다. 새로 입력받지 않는다.
import { parseArgs, requireAbs } from './lib/args.mjs';
import { COMMON, publishCard } from './lib/context.mjs';
import { ledgerPath } from './lib/dashboard.mjs';
import { findJob, loadIndex, loadState } from './lib/job.mjs';
import { computeMetrics, weeklyMessage } from './lib/metrics.mjs';
import { nowFrom, requireJobId, runMain } from './lib/util.mjs';

const USAGE = 'node metrics.mjs --main <dir> [--id <업무 id>] [--weekly] [--dashboard <file|none>]';

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string', weekly: 'bool' }, USAGE);
  const main = requireAbs(options, 'main');
  const now = nowFrom(options.now);
  const ledger = ledgerPath(options.dashboard);
  const entries = options.id ? [findJob(main, requireJobId(options.id))] : loadIndex(main).jobs;
  const jobs = entries.map(entry => {
    const state = loadState(entry);
    publishCard(ledger, entry, state, now);
    const metrics = computeMetrics(state, now);
    return { id: entry.id, title: state.title, agent: state.agent, level: state.level, graduated: state.graduated, metrics, weeks: metrics.weeks };
  });
  return { jobs, message: options.weekly ? weeklyMessage(jobs, now) : '' };
});
