#!/usr/bin/env node
// 기준 시간: 주인이 이 일을 직접 하면 1건에 몇 분 걸리는지. 나중에 "아낀 시간"을 계산하는 출발점이다.
//   node baseline.mjs --main <dir> --id ad-log --minutes 40 [--note "엑셀 합계까지"] [--replace]
//   node baseline.mjs --main <dir> --id ad-log            (지금 값 읽기)
// 주인이 답한 값만 저장한다. 비교 기준이 흔들리지 않게 다른 값으로 바꿀 때는 --replace 가 필요하다.
import { parseArgs } from './lib/args.mjs';
import { COMMON, openJob } from './lib/context.mjs';
import { saveState } from './lib/job.mjs';
import { redact } from './lib/redact.mjs';
import { fail, kstDate, nowFrom, runMain } from './lib/util.mjs';

const USAGE = 'node baseline.mjs --main <dir> --id <업무 id> [--minutes <1~1440 분>] [--note <한 줄>] [--replace]';

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string', minutes: 'string', note: 'string', replace: 'bool' }, USAGE);
  const { entry, state } = openJob(options);
  const before = state.baseline ?? null;
  if (options.minutes === undefined) return { baseline: before };

  const minutes = Number(options.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) fail('이 일을 직접 하시면 1건에 몇 분쯤 걸리나요? 어림으로 1분에서 1,440분 사이로 알려 주세요.', 2);
  if (before?.minutes === minutes) return { changed: false, baseline: before, message: `기준 시간은 그대로 ${minutes}분이에요.` };
  if (before && !options.replace) fail(`기준 시간이 이미 ${before.minutes}분으로 있어요. ${minutes}분으로 바꿀까요? 바꾸면 전후 비교 기준도 달라져요.`, 2);

  const now = nowFrom(options.now);
  state.baseline = { minutes, note: redact(String(options.note ?? '').replace(/\s+/g, ' ').trim()).text.slice(0, 120), recordedOn: kstDate(now) };
  state.events.push({ at: kstDate(now), kind: 'baseline', note: before ? `기준 시간 ${before.minutes}분 → ${minutes}분` : `기준 시간 ${minutes}분` });
  saveState(entry, state);
  return { changed: true, baseline: state.baseline, message: `기준 시간을 ${minutes}분으로 적어 뒀어요. 이 값으로 나중에 아낀 시간을 계산해요.` };
});
