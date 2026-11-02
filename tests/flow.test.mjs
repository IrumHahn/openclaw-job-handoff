import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skill', 'job-handoff', 'scripts');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'job-handoff-'));
  const main = path.join(root, 'ws-main');
  const ana = path.join(root, 'ws-ana');
  const jae = path.join(root, 'ws-jae');
  for (const dir of [main, ana, jae]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(ana, 'AGENTS.md'), '# 아나\n내가 쓴 규칙\n');
  const team = path.join(root, 'team.json');
  fs.writeFileSync(team, JSON.stringify([{ id: 'main', workspace: main }, { id: 'ana', workspace: ana }, { id: 'jae', workspace: jae }]));
  const ledger = path.join(root, 'dashboard', 'ojt.json');
  const run = (script, args, { ok = true } = {}) => {
    const r = spawnSync(process.execPath, [path.join(scripts, `${script}.mjs`), '--main', main, ...args], { encoding: 'utf8' });
    if (ok) assert.equal(r.status, 0, `${script} ${args.join(' ')}\n${r.stderr}`);
    return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr };
  };
  const file = (name, content) => { const f = path.join(root, name); fs.writeFileSync(f, content); return f; };
  return { root, main, ana, jae, team, ledger, run, file, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const MANUAL = `# 쿠팡 광고 일지 — 업무 설명서

## 1. 왜 하나
광고비가 새는 캠페인을 하루 안에 찾는다.
## 2. 언제 하나
매일 9시, 대표가 리포트 엑셀을 보내면.
## 3. 무엇을 보고 하나
광고 리포트 엑셀의 캠페인·광고비·매출 칸.
## 4. 어떤 순서로 하나
1) 열기 2) 캠페인별 합계 3) ROAS 계산 4) 표 5) 3줄 요약
## 5. 어디서 판단하나
ROAS 200% 미만이면 빨간 표시만, 끄지 않는다.
## 6. 좋은 결과는 어떤 모양인가
cases/01.md
## 7. 하면 안 되는 것 · 먼저 물어볼 것
광고를 끄거나 예산을 바꾸지 않는다.
`;

test('full handoff: start → manual → cases → talkback → replay → reports → L3 → teach → 수료', () => {
  const t = setup();
  try {
    const common = ['--team', t.team, '--dashboard', t.ledger];
    fs.mkdirSync(path.dirname(t.ledger));
    // 시작
    const started = t.run('start', ['--id', 'ad-log', '--title', '쿠팡 광고 일지', '--agent', 'ana', ...common]).out;
    assert.equal(started.job.level, 'L0');
    const dir = path.join(t.ana, 'jobs', 'ad-log');
    for (const name of ['job.md', 'lessons.md', 'record.md', 'boundary.md', 'state.json', 'cases', 'reports']) assert.ok(fs.existsSync(path.join(dir, name)), name);
    const anaAgents = fs.readFileSync(path.join(t.ana, 'AGENTS.md'), 'utf8');
    assert.match(anaAgents, /내가 쓴 규칙/);
    assert.match(anaAgents, /jobs\/ad-log\/job\.md/);
    assert.match(anaAgents, /성장 노트\(self-improve\)에는 메모하지 않는다/);
    assert.ok(anaAgents.includes(`--main\` 은 총괄 작업 폴더 \`${fs.realpathSync(t.main)}`));
    assert.match(fs.readFileSync(path.join(t.main, 'AGENTS.md'), 'utf8'), /인수인계 시작/);
    assert.ok(fs.existsSync(path.join(t.ana, 'AGENTS.md.job-handoff.bak')));
    assert.equal(t.run('start', ['--id', 'ad-log', '--title', 'x', '--agent', 'ana', ...common], { ok: false }).status, 1);
    assert.equal(t.run('start', ['--id', 'x', '--title', 'x', '--agent', 'nobody', ...common], { ok: false }).status, 1);

    // 설명서 v1 + 사례 3개(판단 이유 없으면 거절)
    const v1 = t.run('job', ['--id', 'ad-log', '--file', t.file('m1.md', MANUAL), '--reason', '인터뷰', ...common]).out;
    assert.equal(v1.version, 1);
    assert.deepEqual(v1.warnings, []);
    assert.equal(t.run('case', ['--id', 'ad-log', '--title', '11/3', '--input', '엑셀', ...common], { ok: false }).status, 2);
    for (const d of ['11/3', '11/4', '11/5']) t.run('case', ['--id', 'ad-log', '--title', d, '--input', '엑셀', '--judgment', 'B는 신규라 표시 안 함', '--output', '표', ...common]);
    assert.equal(t.run('case', ['--id', 'ad-log', '--list', ...common]).out.count, 3);

    // L0: 되말하기 ✏️ → 설명서 v2 + 배운 것 → 되말하기 👍 → 승급
    t.run('report', ['--id', 'ad-log', '--kind', 'talkback', '--title', '제가 이해한 순서', '--body', '1. 9시…', '--rid', 'tb1', ...common]);
    assert.equal(t.run('grade', ['--id', 'ad-log', '--ref', 'tb1', '--grade', 'fix', ...common], { ok: false }).status, 2);
    const g1 = t.run('grade', ['--id', 'ad-log', '--ref', 'tb1', '--grade', 'fix', '--note', '광고비는 VAT 빼고', ...common]).out;
    assert.match(g1.applied[0].todo, /job\.mjs/);
    assert.equal(t.run('level', ['--id', 'ad-log', 'promote', '--approved', ...common], { ok: false }).status, 3);
    const v2 = t.run('job', ['--id', 'ad-log', '--file', t.file('m2.md', MANUAL.replace('합계', '합계(VAT 제외)')), '--lesson', '광고비는 VAT 빼고 기록', '--reason', '되말하기 ✏️', ...common]).out;
    assert.equal(v2.version, 2);
    assert.ok(fs.existsSync(path.join(dir, 'versions', 'job.v1.md')));
    assert.match(fs.readFileSync(path.join(dir, 'lessons.md'), 'utf8'), /광고비는 VAT 빼고 기록 \(설명서 v2\)/);
    t.run('report', ['--id', 'ad-log', '--kind', 'talkback', '--title', '다시 이해한 순서', '--body', '1. VAT 제외', '--rid', 'tb2', ...common]);
    t.run('grade', ['--id', 'ad-log', '--ref', 'tb2', '--grade', 'good', ...common]);
    assert.equal(t.run('level', ['--id', 'ad-log', 'check', ...common]).out.eligible, true);
    assert.equal(t.run('level', ['--id', 'ad-log', 'promote', ...common], { ok: false }).status, 2);
    assert.equal(t.run('level', ['--id', 'ad-log', 'promote', '--approved', ...common]).out.to, 'L1');

    // L1: 재현 시험 3건 👍 → L2
    for (const n of [1, 2, 3]) {
      t.run('report', ['--id', 'ad-log', '--kind', 'replay', '--title', `사례 ${n} 재현`, '--body', '표', '--rid', `rp${n}`, ...common]);
      t.run('grade', ['--id', 'ad-log', '--ref', `rp${n}`, '--grade', 'good', ...common]);
    }
    assert.equal(t.run('level', ['--id', 'ad-log', 'promote', '--approved', ...common]).out.to, 'L2');

    // L2: 실제 보고. ❌ 가 끼면 연속이 끊긴다. 대시보드 파일·텔레그램 문장으로도 채점.
    const report = (rid, date) => t.run('report', ['--id', 'ad-log', '--title', `${date} 광고 일지`, '--body', 'ROAS 182%', '--date', date, '--rid', rid, ...common]);
    report('d1', '2026-11-10'); report('d2', '2026-11-11');
    t.run('grade', ['--id', 'ad-log', '--ref', 'd1', '--grade', 'good', ...common]);
    t.run('grade', ['--id', 'ad-log', '--ref', 'd2', '--grade', 'bad', '--note', '캠페인 B 누락', ...common]);
    const ledger = JSON.parse(fs.readFileSync(t.ledger, 'utf8'));
    assert.equal(ledger.jobs[0].level, 'L2');
    assert.equal(ledger.jobs[0].lesson.startsWith('2026'), true);
    assert.ok(ledger.reports.find(r => r.sourceId === 'report:ad-log:d1'));
    for (const n of [3, 4, 5, 6, 7]) report(`d${n}`, `2026-11-1${n}`);
    // 대시보드 grades.json (PC 가 쓴 모양)
    const pending = [3, 4].map(n => ({ sourceId: `report:ad-log:d${n}`, grade: 'good', note: '', gradedAt: `2026-11-1${n}T01:00:00.000Z` }));
    const fromFile = t.run('grade', ['--from', t.file('grades.json', JSON.stringify({ version: 1, kind: 'ojt-grades', pending })), ...common]).out;
    assert.equal(fromFile.applied.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(t.ledger, 'utf8')).reports.find(r => r.sourceId === 'report:ad-log:d3').gradeAck, '2026-11-13T01:00:00.000Z');
    // Hub 출력(표시 줄 사이 base64)
    const b64 = Buffer.from(JSON.stringify({ version: 1, kind: 'ojt-grades', pending: [{ sourceId: 'report:ad-log:d5', grade: 'good', note: '', gradedAt: 'T5' }] })).toString('base64');
    t.run('grade', ['--from', t.file('hub.txt', `junk\r\n===OJT-GRADES-BEGIN=== \r\n${b64}\r\n===OJT-GRADES-END===\r\n`), ...common]);
    // 텔레그램 복사 문장
    const tg = t.run('grade', ['--text', '[채점] 쿠팡 광고 일지 · 2026-11-16 · 11/16 광고 일지 → 👍 (id report:ad-log:d6)', ...common]).out;
    assert.equal(tg.applied[0].grade, 'good');
    assert.equal(t.run('level', ['--id', 'ad-log', 'check', ...common]).out.eligible, false);
    const last = t.run('grade', ['--id', 'ad-log', '--ref', 'd7', '--grade', 'good', ...common]).out;
    assert.equal(last.applied[0].streak, 5);
    assert.equal(last.applied[0].eligible, true);
    assert.equal(t.run('level', ['--id', 'ad-log', 'promote', '--approved', ...common]).out.to, 'L3');

    // L3: 재현 시험 3건 + 묻기 규칙 옮기기 둘 다 필요
    for (const n of [4, 5, 6]) {
      t.run('report', ['--id', 'ad-log', '--kind', 'replay', '--title', `회귀 ${n}`, '--body', '표', '--rid', `rp${n}`, ...common]);
      t.run('grade', ['--id', 'ad-log', '--ref', `rp${n}`, '--grade', 'good', ...common]);
    }
    assert.equal(t.run('level', ['--id', 'ad-log', 'check', ...common]).out.eligible, false);
    t.run('boundary', ['--id', 'ad-log', '--add', '광고 일지 기록', '--section', 'ask', ...common]);
    assert.equal(t.run('boundary', ['--id', 'ad-log', '--move', '없는 항목', '--to', 'after', ...common], { ok: false }).status, 1);
    t.run('boundary', ['--id', 'ad-log', '--move', '광고 일지 기록', '--to', 'after', ...common]);
    assert.match(fs.readFileSync(path.join(dir, 'boundary.md'), 'utf8'), /## 하고 나서 보고\n- 광고 일지 기록/);
    assert.equal(t.run('level', ['--id', 'ad-log', 'promote', '--approved', ...common]).out.to, 'L4');

    // L4: 둘째 직원에게 복사해 가르치기 시험 → 원래 업무 수료
    const copy = t.run('start', ['--id', 'ad-log-2', '--title', '쿠팡 광고 일지(재고)', '--agent', 'jae', '--copy-from', 'ad-log', ...common]).out;
    assert.equal(copy.copiedFrom, 'ad-log');
    assert.equal(fs.readdirSync(path.join(t.jae, 'jobs', 'ad-log-2', 'cases')).length, 3);
    assert.match(fs.readFileSync(path.join(t.jae, 'jobs', 'ad-log-2', 'job.md'), 'utf8'), /VAT 제외/);
    t.run('report', ['--id', 'ad-log', '--kind', 'teach', '--title', '재고가 설명서만 보고 처리', '--body', '표', '--rid', 'teach1', ...common]);
    t.run('grade', ['--id', 'ad-log', '--ref', 'teach1', '--grade', 'good', ...common]);
    assert.equal(t.run('level', ['--id', 'ad-log', 'promote', '--approved', ...common]).out.to, '수료');

    // 현황·채점표·색인
    const status = t.run('status', [...common]).out;
    assert.equal(status.jobs.length, 2);
    assert.equal(status.jobs[0].level, '수료');
    const record = fs.readFileSync(path.join(dir, 'record.md'), 'utf8');
    assert.match(record, /L0\(\d{4}-\d{2}-\d{2}\), L1/);
    assert.match(record, /❌/);
    assert.match(record, /\| \[되말하기\] 다시 이해한 순서 \|/);
    assert.doesNotMatch(record, /되말하기 · \[되말하기\]/);
    assert.match(fs.readFileSync(path.join(t.main, 'jobs', 'INDEX.md'), 'utf8'), /ad-log-2 \| jae/);

    // 안내 구역 빼기: 내가 쓴 규칙은 남는다
    t.run('hook', ['--remove']);
    const after = fs.readFileSync(path.join(t.ana, 'AGENTS.md'), 'utf8');
    assert.doesNotMatch(after, /job-handoff-hook/);
    assert.match(after, /내가 쓴 규칙/);
  } finally { t.cleanup(); }
});

test('safety: secrets are masked, long manuals warn, missing sections warn, no dashboard folder → no ledger', () => {
  const t = setup();
  try {
    const common = ['--team', t.team];
    t.run('start', ['--id', 'cs', '--title', '문의 답변', '--agent', 'ana', ...common]);
    const long = t.run('job', ['--id', 'cs', '--file', t.file('long.md', `# 문의\n## 1. 왜\n${'가'.repeat(1600)}\n`), ...common]).out;
    assert.equal(long.warnings.length, 2);
    t.run('report', ['--id', 'cs', '--title', '답변', '--body', '고객 hong@example.com 010-1234-5678 에게 답함', '--rid', 'r1', ...common]);
    const body = fs.readFileSync(path.join(t.ana, 'jobs', 'cs', 'reports', 'r1.md'), 'utf8');
    assert.doesNotMatch(body, /hong@example\.com|1234-5678/);
    assert.equal(fs.existsSync(t.ledger), false);
    assert.equal(t.run('grade', ['--text', '그냥 좋아요', ...common], { ok: false }).status, 1);
    assert.equal(t.run('grade', ['--id', 'cs', '--ref', 'nope', '--grade', 'good', ...common], { ok: false }).status, 1);
    // 총괄이 직접 수습하는 업무: 총괄 AGENTS.md 에 총괄 안내 + 업무 안내가 한 구역에 같이 있다
    t.run('start', ['--id', 'brief', '--title', '아침 브리핑', '--agent', 'main', ...common]);
    const mainAgents = fs.readFileSync(path.join(t.main, 'AGENTS.md'), 'utf8');
    assert.match(mainAgents, /총괄이 맡는 일/);
    assert.match(mainAgents, /jobs\/brief\/job\.md/);
    assert.equal(mainAgents.split('job-handoff-hook:start').length, 2);
  } finally { t.cleanup(); }
});

test('baseline: 직접 할 때 시간을 저장하고, 바꿀 땐 확인하고, 현황·채점표·둘째 직원에 이어진다', () => {
  const t = setup();
  try {
    const common = ['--team', t.team, '--dashboard', 'none'];
    t.run('start', ['--id', 'ad-log', '--title', '쿠팡 광고 일지', '--agent', 'ana', ...common]);

    const empty = t.run('status', ['--id', 'ad-log', '--dashboard', 'none']).out;
    assert.equal(empty.jobs[0].baseline, null);
    assert.match(empty.message, /기준 시간 없음/);
    assert.equal(t.run('baseline', ['--id', 'ad-log', '--dashboard', 'none']).out.baseline, null);

    for (const bad of ['0', '-5', '1.5', 'abc', '1441']) {
      assert.equal(t.run('baseline', ['--id', 'ad-log', '--minutes', bad, '--dashboard', 'none'], { ok: false }).status, 2, bad);
    }

    const saved = t.run('baseline', ['--id', 'ad-log', '--minutes', '40', '--note', '엑셀 합계까지', '--now', '2026-11-07T10:00:00+09:00', '--dashboard', 'none']).out;
    assert.equal(saved.baseline.minutes, 40);
    assert.equal(saved.baseline.recordedOn, '2026-11-07');
    assert.match(saved.message, /40분/);

    const record = fs.readFileSync(path.join(t.ana, 'jobs', 'ad-log', 'record.md'), 'utf8');
    assert.match(record, /기준 시간: 직접 하면 40분/);
    assert.match(t.run('status', ['--id', 'ad-log', '--dashboard', 'none']).out.message, /직접 하면 40분/);

    // 같은 값은 그대로, 다른 값은 확인 없이 덮어쓰지 않는다(비교 기준이 흔들리지 않게).
    assert.equal(t.run('baseline', ['--id', 'ad-log', '--minutes', '40', '--dashboard', 'none']).out.changed, false);
    assert.equal(t.run('baseline', ['--id', 'ad-log', '--minutes', '30', '--dashboard', 'none'], { ok: false }).status, 2);
    const replaced = t.run('baseline', ['--id', 'ad-log', '--minutes', '30', '--replace', '--dashboard', 'none']).out;
    assert.equal(replaced.baseline.minutes, 30);
    assert.match(fs.readFileSync(path.join(t.ana, 'jobs', 'ad-log', 'record.md'), 'utf8'), /40분 → 30분/);

    // 기준 시간 기록은 승급 계산에 끼어들지 않는다.
    assert.match(t.run('level', ['--id', 'ad-log', 'check', '--dashboard', 'none']).out.progress, /되말하기/);

    t.run('start', ['--id', 'ad-log-2', '--title', '쿠팡 광고 일지(둘째)', '--agent', 'jae', '--copy-from', 'ad-log', ...common]);
    assert.equal(t.run('baseline', ['--id', 'ad-log-2', '--dashboard', 'none']).out.baseline.minutes, 30);
  } finally { t.cleanup(); }
});
