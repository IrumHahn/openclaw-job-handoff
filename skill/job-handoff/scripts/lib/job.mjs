// 업무 폴더 하나 = 수습 1건. 담당 직원의 작업 폴더 안 jobs/<id>/ 에 둔다(직원이 매 세션 읽을 수 있게).
//   job.md       업무 설명서 (판마다 versions/ 에 백업)
//   cases/       사례 (입력 · 대표의 판단과 이유 · 결과)
//   lessons.md   배운 것 일지 (날짜순 한 줄)
//   record.md    채점표 (state.json 에서 그려 낸다 — 손으로 고치지 않는다)
//   boundary.md  묻기 규칙 (먼저 묻기 / 하고 나서 보고 / 절대 하지 않기)
//   reports/     보고 원문
//   state.json   기계가 읽는 원본 (단계·사건·보고 목록·기준 시간)
// 총괄 작업 폴더의 jobs/index.json 이 "어떤 업무가 누구 폴더에 있나"를 기억한다.
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, fail, kstDate, readJson, readText, writeJson } from './util.mjs';

export const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4'];
export const LEVEL_NAMES = { L0: '견습', L1: '따라하기', L2: '같이 하기', L3: '혼자 하기', L4: '가르치기' };
export const GRADE_EMOJI = { good: '👍', fix: '✏️', bad: '❌' };
export const KINDS = ['report', 'talkback', 'replay', 'teach'];
export const KIND_LABEL = { report: '보고', talkback: '되말하기', replay: '재현 시험', teach: '가르치기 시험' };
export const STREAK_GOAL = 5;
export const REPLAY_GOAL = 3;
export const JOB_CHAR_LIMIT = 1500;
export const JOB_SECTIONS = ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.'];

// 단계마다 "통과 조건". 단계는 '지금 수습 중인 단계'다(L0 = 되말하기 중). 통과하면 다음 단계로 올라간다.
export const PASS_RULES = {
  L0: '되말하기에 대표가 👍 (틀린 곳 없음)',
  L1: `새 대화에서 지난 사례 재현 시험 ${REPLAY_GOAL}건 연속 👍`,
  L2: `실제 보고 연속 👍 ${STREAK_GOAL}번`,
  L3: `다시 보는 재현 시험 ${REPLAY_GOAL}건 연속 👍 + '먼저 묻기' 1개를 '하고 나서 보고'로 옮김`,
  L4: '다른 직원이 이 설명서만 보고 1건 처리해 👍',
};

export function indexFile(main) { return path.join(main, 'jobs', 'index.json'); }
export function loadIndex(main) {
  const index = readJson(indexFile(main), { version: 1, jobs: [] });
  if (!Array.isArray(index.jobs)) fail('jobs/index.json 모양이 이상해요');
  return index;
}
export function saveIndex(main, index) {
  writeJson(indexFile(main), index);
  const rows = index.jobs.map(j => `| ${j.title} | ${j.id} | ${j.agent} | ${j.level || 'L0'} ${LEVEL_NAMES[j.level || 'L0']} | jobs/${j.id}/ |`)
  atomicWrite(path.join(main, 'jobs', 'INDEX.md'), `# 수습 업무 목록\n\njob-handoff 스킬이 관리해요. 손으로 고치지 마세요.\n\n| 업무 | id | 담당 | 단계 | 폴더(담당 직원 작업 폴더 안) |\n|---|---|---|---|---|\n${rows.join('\n')}\n`)
}

export function findJob(main, id) {
  const entry = loadIndex(main).jobs.find(j => j.id === id)
  if (!entry) fail(`아직 시작하지 않은 업무예요: ${id} — "인수인계 시작"부터 해 주세요 (unknown job)`)
  return entry
}

export function jobDir(entry) { return path.join(entry.workspace, 'jobs', entry.id) }
export function stateFile(entry) { return path.join(jobDir(entry), 'state.json') }
export function loadState(entry) {
  const state = readJson(stateFile(entry), null)
  if (!state) fail(`업무 폴더가 없어요: ${entry.id} (state.json missing)`)
  return state
}

export function newState({ id, title, agent, now }) {
  return { version: 1, id, title, agent, level: 'L0', levelSince: 0, passed: [], graduated: false, jobVersion: 0, createdAt: kstDate(now), events: [], reports: [] }
}

// 지금 단계에 들어온 뒤의 사건만 본다.
function sinceLevel(state) { return state.events.slice(state.levelSince || 0) }
function graded(events, kind) { return events.filter(e => e.kind === kind && e.grade) }

// 최근 채점부터 거꾸로 센 연속 👍 (✏️·❌ 를 만나면 멈춘다). 기본은 실제 보고만.
export function streakOf(events, kind = 'report') {
  let count = 0
  for (const e of [...graded(events, kind)].reverse()) {
    if (e.grade !== 'good') break
    count += 1
  }
  return count
}

export function eligibility(state) {
  if (state.graduated) return { level: state.level, eligible: false, rule: '수습을 모두 마쳤어요', progress: '수료' }
  const events = sinceLevel(state)
  const level = state.level
  const rule = PASS_RULES[level]
  if (level === 'L0') {
    const last = graded(events, 'talkback').at(-1)
    return { level, rule, eligible: last?.grade === 'good', progress: last ? `되말하기 마지막 채점 ${GRADE_EMOJI[last.grade]}` : '되말하기 전' }
  }
  if (level === 'L1' || level === 'L3') {
    const run = streakOf(events, 'replay')
    const boundaryMoved = events.some(e => e.kind === 'boundary' && e.move === 'ask->after')
    const replayOk = run >= REPLAY_GOAL
    const eligible = level === 'L1' ? replayOk : replayOk && boundaryMoved
    const progress = `재현 시험 연속 👍 ${Math.min(run, REPLAY_GOAL)}/${REPLAY_GOAL}${level === 'L3' ? ` · 묻기 규칙 옮김 ${boundaryMoved ? '✓' : '아직'}` : ''}`
    return { level, rule, eligible, progress }
  }
  if (level === 'L2') {
    const run = streakOf(events, 'report')
    return { level, rule, eligible: run >= STREAK_GOAL, progress: `보고 연속 👍 ${Math.min(run, STREAK_GOAL)}/${STREAK_GOAL}` }
  }
  const last = graded(events, 'teach').at(-1)
  return { level, rule, eligible: last?.grade === 'good', progress: last ? `가르치기 시험 ${GRADE_EMOJI[last.grade]}` : '가르치기 시험 전' }
}

export function promote(state, now) {
  const check = eligibility(state)
  if (!check.eligible) fail(`아직 승급 조건이 안 됐어요 — ${check.rule} (지금: ${check.progress})`, 3)
  const from = state.level
  state.passed.push({ level: from, at: kstDate(now) })
  if (from === 'L4') state.graduated = true
  else state.level = LEVELS[LEVELS.indexOf(from) + 1]
  state.events.push({ at: kstDate(now), kind: 'level', note: state.graduated ? `${from} 통과 · 수료` : `${from} 통과 → ${state.level}` })
  state.levelSince = state.events.length
  return { from, to: state.graduated ? '수료' : state.level }
}

export function lastLesson(entry) {
  const lines = readText(path.join(jobDir(entry), 'lessons.md')).split('\n').filter(l => l.startsWith('- '))
  return lines.at(-1)?.slice(2) || ''
}

export function renderRecord(state) {
  const check = eligibility(state)
  const rows = [...state.events].reverse().map(e => {
    if (e.kind === 'level' || e.kind === 'job' || e.kind === 'boundary' || e.kind === 'baseline') return `| ${e.at} | ${{ level: '승급', job: '설명서', boundary: '묻기 규칙', baseline: '기준 시간' }[e.kind]} | ${e.note || ''} |  |`
    const label = KIND_LABEL[e.kind] || e.kind
    const title = e.title || e.ref
    return `| ${e.date || e.at} | ${title.startsWith('[') ? title : `${label} · ${title}`} | ${e.note || ''} | ${e.grade ? GRADE_EMOJI[e.grade] : '채점 전'} |`
  })
  const head = [
    `# 채점표 — ${state.title}`,
    '',
    'job-handoff 스킬이 state.json 에서 다시 그려요. 손으로 고치지 마세요.',
    '',
    `- 담당: ${state.agent}`,
    `- 지금 단계: ${state.graduated ? '수료' : `${state.level} ${LEVEL_NAMES[state.level]}`}`,
    `- 통과 조건: ${check.rule}`,
    `- 진행: ${check.progress}${check.eligible ? ' → 승급 조건 충족' : ''}`,
    `- 통과한 단계: ${state.passed.map(p => `${p.level}(${p.at})`).join(', ') || '없음'}`,
    `- 설명서 판: v${state.jobVersion}`,
    `- 기준 시간: ${state.baseline ? `직접 하면 ${state.baseline.minutes}분 (주인 어림)` : '아직 없음'}`,
    '',
    '| 날짜 | 무엇 | 한 줄 | 채점 |',
    '|---|---|---|---|',
  ]
  return `${[...head, ...rows].join('\n')}\n`
}

export function saveState(entry, state) {
  writeJson(stateFile(entry), state)
  atomicWrite(path.join(jobDir(entry), 'record.md'), renderRecord(state))
}

export function jobTemplate(title, agent) {
  return `# ${title} — 업무 설명서

담당: ${agent} · 이 설명서는 인터뷰로 만들고, 채점에서 틀린 곳이 나올 때마다 고쳐요.

## 1. 왜 하나 (끝났을 때 사업에 생기는 변화)

## 2. 언제 하나 (시작 신호)

## 3. 무엇을 보고 하나 (화면·파일·시트, 어떤 칸)

## 4. 어떤 순서로 하나 (단계마다 "끝났다"는 신호)

## 5. 어디서 판단하나 (갈림길과 기준 숫자)

## 6. 좋은 결과는 어떤 모양인가 (예시는 cases/)

## 7. 하면 안 되는 것 · 먼저 물어볼 것 (boundary.md 와 같게)
`
}

export function boundaryTemplate(title) {
  return `# 묻기 규칙 — ${title}

## 먼저 묻기
- 돈이 들거나 바깥(고객·거래처·게시)으로 나가는 일

## 하고 나서 보고

## 절대 하지 않기
- 비밀번호·카드번호·고객 연락처를 대화나 보고에 쓰기
`
}

export function lessonsTemplate(title) {
  return `# 배운 것 일지 — ${title}\n\n틀린 것과 고친 것을 날짜순으로 한 줄씩 적어요.\n\n`
}

export function createJobFolder(entry, state, files = {}) {
  const dir = jobDir(entry)
  if (fs.existsSync(path.join(dir, 'state.json'))) fail(`이미 있는 업무예요: ${entry.id}`)
  fs.mkdirSync(path.join(dir, 'cases'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'versions'), { recursive: true })
  atomicWrite(path.join(dir, 'job.md'), files.job ?? jobTemplate(state.title, state.agent))
  atomicWrite(path.join(dir, 'boundary.md'), files.boundary ?? boundaryTemplate(state.title))
  atomicWrite(path.join(dir, 'lessons.md'), lessonsTemplate(state.title))
  saveState(entry, state)
}
