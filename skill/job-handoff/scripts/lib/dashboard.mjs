// 대시보드(openclaw-personal-dashboard v0.5) 「수습」 메뉴와의 연결.
//   보내기: dashboard-builder 의 수습 장부(<dashboard>/ojt.json)에 업무 카드·보고를 올린다 → build_dashboard + send_to_pc 가 PC 로 보낸다.
//   받기  : PC 가 쓴 grades.json(또는 Hub 출력의 표시 줄 사이 base64)을 읽는다 → 채점 반영 → 장부의 gradeAck 로 "반영됨"을 돌려준다.
// 장부 모양은 dashboard-builder/scripts/ojt.mjs 와 같다: { version:1, jobs:[{id,title,agent,level,lesson,summary,metrics}], reports:[{sourceId,job,agent,title,body,date,gradeAck}] }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail, readJson, writeJson } from './util.mjs';

export const GRADES_BEGIN = '===OJT-GRADES-BEGIN===';
export const GRADES_END = '===OJT-GRADES-END===';
export const DEFAULT_LEDGER = path.join(os.homedir(), '.openclaw', 'workspace', 'dashboard', 'ojt.json');
const MAX_BODY = 4000;

export function reportSourceId(jobId, rid) { return `report:${jobId}:${rid}`; }
export function parseSourceId(sourceId) {
  const m = /^report:([a-z0-9][a-z0-9-]{0,40}):(.+)$/.exec(String(sourceId || ''));
  return m ? { job: m[1], rid: m[2] } : null;
}

// 'none' 이면 쓰지 않는다. 기본 경로는 대시보드 폴더가 이미 있을 때만 쓴다(대시보드를 안 쓰는 사람에게 폴더를 만들지 않는다).
export function ledgerPath(option) {
  if (option === 'none') return null;
  if (option) { if (!path.isAbsolute(option)) fail('--dashboard must be an absolute path or none'); return option; }
  return fs.existsSync(path.dirname(DEFAULT_LEDGER)) ? DEFAULT_LEDGER : null;
}

function load(file) {
  const raw = readJson(file, { version: 1, jobs: [], reports: [] });
  return { version: 1, jobs: Array.isArray(raw.jobs) ? raw.jobs : [], reports: Array.isArray(raw.reports) ? raw.reports : [] };
}

export function upsertJobCard(file, card) {
  if (!file) return false;
  const ledger = load(file);
  const existing = ledger.jobs.find(j => j.id === card.id);
  const next = { id: card.id, title: card.title, agent: card.agent, level: card.level, lesson: card.lesson || '', summary: card.summary || '', metrics: card.metrics || '' };
  if (existing) Object.assign(existing, next); else ledger.jobs.push(next);
  writeJson(file, ledger);
  return true;
}

export function upsertReport(file, report) {
  if (!file) return false;
  const ledger = load(file);
  const sourceId = reportSourceId(report.job, report.rid);
  const existing = ledger.reports.find(r => r.sourceId === sourceId);
  const next = { sourceId, job: report.job, agent: report.agent, title: report.title, body: String(report.body || '').slice(0, MAX_BODY), date: report.date, gradeAck: existing?.gradeAck || '' };
  if (existing) Object.assign(existing, next); else ledger.reports.push(next);
  writeJson(file, ledger);
  return true;
}

export function ack(file, sourceId, gradedAt) {
  if (!file || !fs.existsSync(file)) return false;
  const ledger = load(file);
  const report = ledger.reports.find(r => r.sourceId === sourceId);
  if (!report) return false;
  report.gradeAck = String(gradedAt);
  writeJson(file, ledger);
  return true;
}

// grades.json 원문, 또는 Hub exec 출력 → pending 배열.
export function parseGrades(raw) {
  const text = String(raw);
  let json = text.trim();
  const begin = text.indexOf(GRADES_BEGIN);
  if (begin >= 0) {
    const end = text.indexOf(GRADES_END, begin);
    const between = text.slice(begin + GRADES_BEGIN.length, end < 0 ? undefined : end);
    if (/NO-GRADES/.test(between)) return [];
    const compact = between.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(compact)) fail('채점 출력이 깨졌어요 — 명령을 글자 그대로 실행했는지 확인해 주세요 (not base64)');
    json = Buffer.from(compact, 'base64').toString('utf8');
  }
  let parsed;
  try { parsed = JSON.parse(json); } catch { fail('채점 파일을 읽지 못했어요 (invalid JSON)'); }
  if (parsed?.kind !== 'ojt-grades' || !Array.isArray(parsed.pending)) fail('수습 채점 파일이 아니에요 (not ojt-grades)');
  return parsed.pending;
}

// 대표가 텔레그램에 붙여 넣는 문장: "[채점] 업무 · 날짜 · 제목 → ✏️ 이유 (id report:ad-log:1109)"
const EMOJI_GRADE = [['👍', 'good'], ['✏️', 'fix'], ['✏', 'fix'], ['❌', 'bad']];
export function parseTelegramLine(line) {
  const text = String(line || '');
  const idMatch = /\(id\s+(report:[^)\s]+)\)\s*$/.exec(text.trim());
  const arrow = text.lastIndexOf('→');
  if (!idMatch || arrow < 0) fail('채점 문장 모양이 아니에요 — 대시보드의 [텔레그램용 복사] 문장을 그대로 붙여 주세요');
  const tail = text.slice(arrow + 1, text.lastIndexOf('(id')).trim();
  const found = EMOJI_GRADE.find(([emoji]) => tail.startsWith(emoji));
  if (!found) fail('채점 이모지(👍 ✏️ ❌)를 찾지 못했어요');
  const note = tail.slice(found[0].length).replace(/^️/, '').trim();
  return { sourceId: idMatch[1], grade: found[1], note };
}
