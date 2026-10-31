#!/usr/bin/env node
// 인수인계 시작: 담당 직원 작업 폴더에 jobs/<id>/ 를 만들고, 총괄 색인에 등록하고, AGENTS.md 안내 구역을 갱신한다.
//   node start.mjs --main <총괄 작업 폴더> --id ad-log --title "쿠팡 광고 일지" --agent ana [--team <팀 JSON>] [--copy-from <기존 업무 id>]
//   --copy-from: 같은 일을 둘째 직원에게 넘길 때(가르치기). 설명서·묻기 규칙·사례를 복사하고 채점표는 새로 시작한다.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireAbs } from './lib/args.mjs';
import { COMMON, publishCard } from './lib/context.mjs';
import { createJobFolder, findJob, jobDir, loadIndex, newState, saveIndex, saveState } from './lib/job.mjs';
import { refreshHooks } from './lib/hook.mjs';
import { ledgerPath } from './lib/dashboard.mjs';
import { findAgent, loadTeam } from './lib/team.mjs';
import { fail, nowFrom, readText, requireJobId, runMain } from './lib/util.mjs';
import { redact } from './lib/redact.mjs';

const USAGE = 'node start.mjs --main <dir> --id <업무 id> --title <업무 이름> --agent <담당 직원 id> [--team <file>] [--copy-from <업무 id>] [--dashboard <file|none>]';

runMain(() => {
  const options = parseArgs(process.argv.slice(2), { ...COMMON, id: 'string', title: 'string', agent: 'string', 'copy-from': 'string' }, USAGE);
  const main = requireAbs(options, 'main');
  const id = requireJobId(options.id);
  const title = redact(String(options.title || '').trim()).text.slice(0, 80);
  if (!title) fail('--title(업무 이름)이 필요해요');
  if (!options.agent) fail('--agent(담당 직원 id)가 필요해요');
  const now = nowFrom(options.now);
  const team = loadTeam(options.team, main);
  const agent = findAgent(team, options.agent);
  const index = loadIndex(main);
  if (index.jobs.some(j => j.id === id)) fail(`이미 있는 업무 id 예요: ${id}`);

  const entry = { id, title, agent: agent.id, workspace: agent.workspace, level: 'L0', createdAt: newState({ id, title, agent: agent.id, now }).createdAt };
  const state = newState({ id, title, agent: agent.id, now });
  let copied = null;
  if (options['copy-from']) {
    const source = findJob(main, requireJobId(options['copy-from']));
    const from = jobDir(source);
    copied = source.id;
    createJobFolder(entry, state, { job: readText(path.join(from, 'job.md')), boundary: readText(path.join(from, 'boundary.md')) });
    for (const name of fs.existsSync(path.join(from, 'cases')) ? fs.readdirSync(path.join(from, 'cases')) : []) fs.copyFileSync(path.join(from, 'cases', name), path.join(jobDir(entry), 'cases', name));
    state.jobVersion = 1;
    state.events.push({ at: entry.createdAt, kind: 'job', note: `'${source.title}'(${source.agent}) 설명서로 시작` });
    saveState(entry, state);
  } else createJobFolder(entry, state);

  index.jobs.push(entry);
  const hooks = refreshHooks(main, index);
  saveIndex(main, index);
  const dashboard = publishCard(ledgerPath(options.dashboard), entry, state);
  return {
    job: { id, title, agent: agent.id, folder: jobDir(entry), level: 'L0' },
    copiedFrom: copied,
    hooks,
    dashboard,
    next: copied ? '담당 직원에게 설명서를 읽고 되말하기(3절)를 시키세요' : '인터뷰 7문항을 한 번에 하나씩 물어보세요(references/interview.md) → job.mjs 로 설명서 첫 판 저장',
    message: copied
      ? `'${title}' 인수인계를 시작했어요. ${agent.id}에게 기존 설명서를 넘겼으니, 읽고 이해한 내용을 되말하게 할게요.`
      : `'${title}' 인수인계를 시작했어요. 담당은 ${agent.id}예요. 이제 일곱 가지를 하나씩 여쭤볼게요. 편하게 말로 답해 주세요.`,
  };
});

