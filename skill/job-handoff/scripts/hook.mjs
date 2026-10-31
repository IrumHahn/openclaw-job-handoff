#!/usr/bin/env node
// AGENTS.md 의 수습 안내 구역 다시 쓰기 / 빼기. start·level 이 알아서 하므로 보통은 필요 없다.
//   node hook.mjs --main <dir> [--remove]
import { parseArgs, requireAbs } from './lib/args.mjs';
import { refreshHooks } from './lib/hook.mjs';
import { loadIndex, saveIndex } from './lib/job.mjs';
import { runMain } from './lib/util.mjs';

const USAGE = 'node hook.mjs --main <dir> [--remove]';

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { main: 'string', remove: 'bool' }, USAGE);
  const main = requireAbs(options, 'main');
  const index = loadIndex(main);
  const results = refreshHooks(main, index, { remove: Boolean(options.remove) });
  saveIndex(main, index);
  return { results, message: options.remove ? '수습 안내를 비서들의 업무 규칙에서 뺐어요. 업무 폴더와 기록은 그대로 있어요.' : '수습 안내를 다시 맞췄어요.' };
});
