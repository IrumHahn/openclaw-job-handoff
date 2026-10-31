#!/usr/bin/env node
// 채점 반영. 세 가지 입구, 결과는 같다(채점표 기록 · 연속 👍 계산 · 승급 조건 확인 · 대시보드 "반영됨").
//   대화에서  : node grade.mjs --main <dir> --id ad-log --ref 20261109-1 --grade fix --note "광고비는 VAT 빼고"
//   텔레그램  : node grade.mjs --main <dir> --text "[채점] … → ✏️ 광고비는 VAT 빼고 (id report:ad-log:20261109-1)"
//   대시보드  : node grade.mjs --main <dir> --from <grades-latest.json 또는 Hub 출력 저장 파일>
// ✏️·❌ 는 이유가 꼭 있어야 한다. 반영 뒤 할 일(가설 → 설명서 수정안 → 승인 → job.mjs --lesson)은 출력의 todo 에 있다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { COMMON, publishCard, syncIndexLevel } from './lib/context.mjs';
import { ack, ledgerPath, parseGrades, parseSourceId, parseTelegramLine, reportSourceId } from './lib/dashboard.mjs';
import { GRADE_EMOJI, KINDS, KIND_LABEL, eligibility, findJob, loadState, saveState, streakOf } from './lib/job.mjs';
import { refreshHooks } from './lib/hook.mjs';
import { redact } from './lib/redact.mjs';
import { fail, kstDate, nowFrom, requireJobId, runMain } from './lib/util.mjs';

const USAGE = 'node grade.mjs --main <dir> (--id <업무> --ref <보고 id> --grade good|fix|bad [--note <한 줄>] | --text <채점 문장> | --from <파일>)';

function apply({ main, ledger, jobId, rid, grade, note, gradedAt, now }) {
  if (!['good', 'fix', 'bad'].includes(grade)) fail('--grade 는 good | fix | bad');
  const cleanNote = redact(String(note || '').replace(/\s+/g, ' ').trim()).text.slice(0, 300);
  if (grade !== 'good' && !cleanNote) fail(`${GRADE_EMOJI[grade]} 는 한 줄 이유가 필요해요. 대표님께 "어디를 고치면 될까요?"라고 여쭤봐 주세요`, 2);
  const entry = findJob(main, jobId);
  const state = loadState(entry);
  const event = state.events.find(e => e.ref === rid && KINDS.includes(e.kind));
  if (!event) fail(`그런 보고가 없어요: ${jobId} ${rid} (unknown report)`);
  const same = event.grade === grade && event.note === cleanNote && event.gradedAt === gradedAt;
  Object.assign(event, { grade, note: cleanNote, gradedAt, gradedOn: kstDate(now) });
  saveState(entry, state);
  const acked = ack(ledger, reportSourceId(jobId, rid), gradedAt);
  if (acked) publishCard(ledger, entry, state);
  const check = eligibility(state);
  return {
    job: jobId, title: state.title, ref: rid, kind: event.kind, grade, emoji: GRADE_EMOJI[grade], note: cleanNote, repeated: same,
    streak: streakOf(state.events.slice(state.levelSince || 0), event.kind === 'replay' ? 'replay' : 'report'),
    level: state.level, eligible: check.eligible, progress: check.progress, dashboardAck: acked,
    todo: grade === 'good'
      ? (check.eligible ? `승급 조건을 채웠어요(${check.rule}). 대표님께 승급을 제안하세요 → 승인하면 level.mjs promote --approved` : null)
      : `① "제가 틀린 이유는 ○○ 같아요" 가설을 말하고 ② 설명서(job.md)를 어떻게 고칠지 수정안을 보여 드리고 ③ 승인받으면 job.mjs --file … --lesson "<배운 것 한 문장>" --reason "${KIND_LABEL[event.kind]} ${GRADE_EMOJI[grade]}"`,
  };
}

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string', ref: 'string', grade: 'string', note: 'string', text: 'string', from: 'string', 'graded-at': 'string' }, USAGE);
  const main = requireAbs(options, 'main');
  const ledger = ledgerPath(options.dashboard);
  const now = nowFrom(options.now);
  let items;
  if (options.from) {
    if (!path.isAbsolute(options.from)) fail('--from must be an absolute path');
    items = parseGrades(fs.readFileSync(options.from, 'utf8')).map(g => {
      const parsed = parseSourceId(g.sourceId);
      return parsed ? { jobId: parsed.job, rid: parsed.rid, grade: g.grade, note: g.note, gradedAt: g.gradedAt } : null;
    }).filter(Boolean);
  } else if (options.text) {
    const t = parseTelegramLine(options.text);
    const parsed = parseSourceId(t.sourceId);
    if (!parsed) fail('채점 문장의 id 를 읽지 못했어요');
    items = [{ jobId: parsed.job, rid: parsed.rid, grade: t.grade, note: t.note, gradedAt: options['graded-at'] || `telegram:${now.toISOString()}` }];
  } else {
    items = [{ jobId: requireJobId(options.id), rid: options.ref, grade: options.grade, note: options.note, gradedAt: options['graded-at'] || `chat:${now.toISOString()}` }];
    if (!items[0].rid) fail('--ref(보고 id)가 필요해요');
  }
  const results = [];
  const skipped = [];
  for (const item of items) {
    try { results.push(apply({ main, ledger, ...item, now })); }
    catch (error) { if (options.from) skipped.push({ ref: `${item.jobId}:${item.rid}`, reason: error.message }); else throw error; }
  }
  // 승급 조건 충족 여부와 무관하게, 단계 표시는 색인과 안내 구역에 맞춰 둔다.
  for (const jobId of new Set(results.map(r => r.job))) {
    const index = syncIndexLevel(main, loadState(findJob(main, jobId)));
    if (index) refreshHooks(main, index);
  }
  const lines = results.map(r => `${r.title} · ${r.emoji}${r.note ? ` ${r.note}` : ''}`);
  return {
    applied: results,
    skipped,
    message: results.length
      ? `채점 ${results.length}건을 받았어요. ${lines.join(' / ')}${results.some(r => r.grade !== 'good') ? ' — 고칠 점은 이유를 정리해서 설명서 수정안으로 여쭤볼게요.' : ''}${results.some(r => r.eligible) ? ' 승급 조건도 채웠어요!' : ''}`
      : '새로 받은 채점이 없어요.',
  };
});
