#!/usr/bin/env node
// 승급. 기분이 아니라 채점표로: 조건을 채웠을 때만 올린다. 비서가 먼저 제안하고, 대표가 "승급시켜 줘"라고 승인해야 promote.
//   node level.mjs --main <dir> --id ad-log check
//   node level.mjs --main <dir> --id ad-log promote --approved
import { parseArgs } from './lib/args.mjs';
import { COMMON, openJob, publishCard, syncIndexLevel } from './lib/context.mjs';
import { LEVEL_NAMES, PASS_RULES, eligibility, promote, saveState } from './lib/job.mjs';
import { refreshHooks } from './lib/hook.mjs';
import { fail, nowFrom, runMain } from './lib/util.mjs';

const USAGE = 'node level.mjs --main <dir> --id <업무 id> (check | promote --approved)';

runMain(() => {
  const argv = process.argv.slice(2);
  const action = argv.find(a => a === 'check' || a === 'promote');
  if (!action) fail(USAGE);
  const options = parseArgs(argv.filter(a => a !== action), { ...COMMON, id: 'string', approved: 'bool' }, USAGE);
  const { main, entry, state, ledger } = openJob(options);
  if (action === 'check') {
    const check = eligibility(state);
    return {
      ...check,
      levelName: LEVEL_NAMES[state.level],
      message: state.graduated
        ? `'${state.title}' 수습을 모두 마쳤어요.`
        : `'${state.title}'은 지금 ${state.level} ${LEVEL_NAMES[state.level]} 단계예요. 통과 조건: ${PASS_RULES[state.level]}. 지금: ${check.progress}.${check.eligible ? ' 승급 조건을 채웠어요!' : ''}`,
    };
  }
  if (!options.approved) fail('대표님 승인 없이 승급하지 않아요. 먼저 승급을 제안하고, "승급시켜 줘"를 받은 뒤 --approved 로 실행하세요', 2);
  const moved = promote(state, nowFrom(options.now));
  saveState(entry, state);
  const index = syncIndexLevel(main, state);
  if (index) refreshHooks(main, index);
  publishCard(ledger, entry, state);
  return {
    ...moved,
    message: moved.to === '수료'
      ? `축하해요! '${state.title}' 수습을 모두 마쳤어요. 다른 직원도 이 설명서로 같은 일을 할 수 있어요.`
      : `승급했어요! '${state.title}' ${moved.from} → ${moved.to} ${LEVEL_NAMES[moved.to]}. 다음 통과 조건: ${PASS_RULES[moved.to]}.`,
  };
});
