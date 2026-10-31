// 메모·제안에 비밀·개인정보가 들어가지 않게 가린다. 완벽하지 않으므로 SKILL.md 에서도 금지한다.
const MASK = '[가림]';
// 32자 이상 덩어리: 소문자·숫자·하이픈으로 된 짧은 토막들의 이름(예: weekly-sales-report-2026-summary-v2)은 식별자로 보고 남긴다.
// 그 밖에는 숫자와 글자가 섞여 있으면 비밀(base64url 등)로 보고 가린다.
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
function maskLongToken(m) {
  if (KEBAB_RE.test(m) && m.split('-').every(segment => segment.length < 16)) return m;
  return /\d/.test(m) && /[A-Za-z]/.test(m) ? MASK : m;
}

const RULES = [
  [/(password|passwd|pwd|비밀번호|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, (_m, label) => `${label}=${MASK}`],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi, MASK],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, MASK],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, MASK],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, MASK],
  [/\b(?:\d{4}[- ]?){3}\d{4}\b/g, MASK],
  [/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, MASK],
  [/\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{3,4}[\s-]?\d{4}\b/g, MASK],
  [/\b[A-Za-z0-9_-]{32,}\b/g, maskLongToken],
];

export function redact(input) {
  let text = String(input ?? '');
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return { text, redacted: text !== String(input ?? '') };
}
