// 수습(job-handoff) 공용 유틸. npm 의존성 없음.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

// 결과는 항상 JSON 한 덩어리로 stdout. message 는 주인에게 그대로 전해도 되는 쉬운 한국어 문장이다.
export function runMain(fn) {
  try {
    const result = fn();
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exit(error.exitCode ?? 1);
  }
}

export function nowFrom(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(`invalid --now: ${value}`);
  return date;
}

const KST_MS = 9 * 60 * 60 * 1000;
export function kstDate(date) { return new Date(date.getTime() + KST_MS).toISOString().slice(0, 10); }

// 임시 파일에 쓴 뒤 rename — 중간에 끊겨도 반쪽 파일이 남지 않는다.
export function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

export function readText(file, fallback = '') {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fallback;
}

export function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail(`깨진 파일이에요: ${path.basename(file)} (invalid JSON)`); }
}

export function writeJson(file, value) { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }

// 텍스트 인자 또는 파일 인자(--x-file) 중 하나.
export function textOption(options, name) {
  const fileKey = `${name}-file`;
  if (options[fileKey]) {
    if (!path.isAbsolute(options[fileKey])) fail(`--${fileKey} must be an absolute path`);
    return fs.readFileSync(options[fileKey], 'utf8');
  }
  return options[name] ?? '';
}

export const JOB_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
export function requireJobId(id) {
  if (!id || !JOB_ID.test(id)) fail('--id 는 영문 소문자·숫자·하이픈이에요 (예: ad-log)');
  return id;
}
