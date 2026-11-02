// 성과 측정: 실제 보고의 채점을 주별로 센다. 되말하기·재현 시험은 연습이라 세지 않는다.
// 아낀 시간(추정) = 기준 시간 × (👍 + ✏️ 건수) − 검토 시간. ❌ 는 결과물을 못 썼으니 아낀 시간에 넣지 않는다.
import { LEVEL_NAMES } from './job.mjs';
import { kstDate } from './util.mjs';

// 채점 1건에 주인이 쓰는 시간(분). 잰 값이 아니라 어림값이다.
export const REVIEW_MINUTES = { good: 1, fix: 5, bad: 10 };
const MAX_WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date) { return new Date(`${date}T00:00:00Z`); }
function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
// 그 날짜가 속한 주의 월요일.
export function weekStart(date) {
  const day = utcDay(date);
  return isoDay(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
}

export function computeMetrics(state, now) {
  const baselineMinutes = state.baseline?.minutes ?? null;
  const counts = new Map();
  for (const event of state.events) {
    const date = event.gradedOn || event.date;
    if (event.kind !== 'report' || !event.grade || !date) continue;
    const week = weekStart(date);
    if (!counts.has(week)) counts.set(week, { good: 0, fix: 0, bad: 0 });
    counts.get(week)[event.grade] += 1;
  }
  const weeks = [];
  if (counts.size) {
    // 채점이 없는 주도 빈칸으로 남겨야 추세가 왜곡되지 않는다.
    const last = weekStart(kstDate(now));
    const first = [...counts.keys()].sort()[0];
    for (let ms = utcDay(first).getTime(); ms <= utcDay(last).getTime(); ms += 7 * DAY_MS) {
      const week = isoDay(ms);
      const { good, fix, bad } = counts.get(week) ?? { good: 0, fix: 0, bad: 0 };
      const done = good + fix + bad;
      const review = good * REVIEW_MINUTES.good + fix * REVIEW_MINUTES.fix + bad * REVIEW_MINUTES.bad;
      weeks.push({
        week, done, good, fix, bad,
        goodRate: done ? Math.round((good / done) * 100) : null,
        savedMinutes: baselineMinutes === null ? null : baselineMinutes * (good + fix) - review,
      });
    }
  }
  return { baselineMinutes, reviewMinutes: REVIEW_MINUTES, weeks: weeks.slice(-MAX_WEEKS) };
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours && `${hours}시간`, rest && `${rest}분`].filter(Boolean).join(' ') || '0분';
}

function compare(value, previous, unit) {
  return `${value}${unit}${previous === undefined || previous === null ? '' : ` (지난주 ${previous}${unit})`}`;
}

function savedLine(current, baselineMinutes) {
  if (baselineMinutes === null) return '아낀 시간은 기준 시간이 없어 아직 계산하지 못해요';
  if (current.savedMinutes <= 0) return '아낀 시간은 아직 없어요 (검토 시간이 더 들었어요)';
  return `아낀 시간 약 ${formatMinutes(current.savedMinutes)} (추정)`;
}

// 일요일 성적표. 채점한 보고가 한 건도 없으면 빈 문자열(아무것도 보내지 않는다).
export function weeklyMessage(jobs, now) {
  const thisWeek = weekStart(kstDate(now));
  const blocks = jobs.filter(job => job.metrics.weeks.length).map(job => {
    const { weeks, baselineMinutes } = job.metrics;
    const current = weeks.find(week => week.week === thisWeek);
    const previous = weeks[weeks.findIndex(week => week.week === thisWeek) - 1];
    const head = `• ${job.title} — ${job.agent}, ${job.graduated ? '수료' : `${job.level} ${LEVEL_NAMES[job.level]}`}`;
    if (!current?.done) return `${head}\n  이번 주는 채점한 보고가 없어요.`;
    const fixes = week => (week?.done ? week.fix + week.bad : null);
    return [
      head,
      `  처리 ${current.done}건 · 내가 고친 횟수 ${compare(fixes(current), fixes(previous), '번')}`,
      `  그대로 쓴 비율 ${compare(current.goodRate, previous?.goodRate, '%')} · ${savedLine(current, baselineMinutes)}`,
    ].join('\n');
  });
  return blocks.length ? `📊 이번 주 수습 성적표\n\n${blocks.join('\n\n')}` : '';
}
