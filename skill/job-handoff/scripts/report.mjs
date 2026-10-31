#!/usr/bin/env node
// 채점받을 결과 1건을 기록한다. 종류: report(실제 업무 보고) · talkback(되말하기) · replay(재현 시험) · teach(가르치기 시험)
//   node report.mjs --main <dir> --id ad-log --title "11/9 광고 일지" (--body <…>|--body-file <f>) [--kind report] [--date 2026-11-09] [--rid 1109]
// 대시보드를 쓰면 「수습」 메뉴에 올라간다(대시보드 업데이트 때 PC 로 전송). 대표는 거기서 👍 ✏️ ❌.
import path from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { COMMON, openJob, publishCard } from './lib/context.mjs';
import { upsertReport } from './lib/dashboard.mjs';
import { KINDS, KIND_LABEL, jobDir, saveState } from './lib/job.mjs';
import { redact } from './lib/redact.mjs';
import { atomicWrite, fail, kstDate, nowFrom, runMain, textOption } from './lib/util.mjs';

const USAGE = 'node report.mjs --main <dir> --id <업무 id> --title <제목> (--body <…>|--body-file <f>) [--kind report|talkback|replay|teach] [--date YYYY-MM-DD] [--rid <id>]';
const RID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string', title: 'string', body: 'string', 'body-file': 'string', kind: 'string', date: 'string', rid: 'string' }, USAGE);
  const { entry, state, ledger } = openJob(options);
  const kind = options.kind || 'report';
  if (!KINDS.includes(kind)) fail(`--kind 는 ${KINDS.join('|')} 중 하나예요`);
  const now = nowFrom(options.now);
  const date = options.date || kstDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('--date 는 YYYY-MM-DD');
  const title = redact(String(options.title || '').trim()).text.slice(0, 120);
  if (!title) fail('--title 이 필요해요');
  const { text: body, redacted } = redact(textOption(options, 'body').trim());
  if (!body) fail('보고 내용이 비어 있어요');
  const sameDay = state.reports.filter(r => r.date === date).length;
  const rid = options.rid || `${date.replace(/-/g, '')}-${sameDay + 1}`;
  if (!RID.test(rid)) fail('--rid 는 영문·숫자·-_ 만');

  const labelled = kind === 'report' ? title : `[${KIND_LABEL[kind]}] ${title}`;
  atomicWrite(path.join(jobDir(entry), 'reports', `${rid}.md`), `# ${labelled}\n\n- 날짜: ${date}\n- 종류: ${KIND_LABEL[kind]}\n\n${body}\n`);
  const existing = state.reports.find(r => r.rid === rid);
  if (existing) Object.assign(existing, { title: labelled, date, kind });
  else state.reports.push({ rid, title: labelled, date, kind });
  const event = state.events.find(e => e.ref === rid && KINDS.includes(e.kind));
  if (event) Object.assign(event, { title: labelled, date, kind });
  else state.events.push({ at: kstDate(now), date, kind, ref: rid, title: labelled, grade: null, note: '' });
  saveState(entry, state);
  const onDashboard = upsertReport(ledger, { job: entry.id, rid, agent: state.agent, title: labelled, body, date });
  if (onDashboard) publishCard(ledger, entry, state);
  return {
    rid,
    kind,
    redacted,
    dashboard: onDashboard,
    next: onDashboard
      ? '대시보드에 보이게 하려면 dashboard-builder 7절(빌드 → 전송)을 실행하세요. 텔레그램에도 보고를 보내고 끝에 채점을 부탁하세요'
      : '텔레그램으로 보고를 보내고 끝에 "👍 / ✏️ 한 줄 / ❌ 한 줄로 채점해 주세요"를 붙이세요',
    message: `${KIND_LABEL[kind]}를 올렸어요. 읽어 보시고 👍 ✏️ ❌ 중 하나로 채점해 주세요. ✏️·❌는 한 줄 이유를 꼭 적어 주세요.`,
  };
});
