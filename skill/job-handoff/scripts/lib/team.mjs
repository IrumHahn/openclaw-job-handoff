import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from './util.mjs';

// --team <file> 이 있으면 그 JSON 배열, 없으면 `openclaw agents list --json`. 총괄 workspace 는 항상 포함한다.
export function loadTeam(teamFile, mainWorkspace) {
  let agents;
  if (teamFile) {
    if (!path.isAbsolute(teamFile)) fail('--team must be an absolute path');
    agents = JSON.parse(fs.readFileSync(teamFile, 'utf8'));
  } else {
    const result = spawnSync('openclaw', ['agents', 'list', '--json'], { encoding: 'utf8' });
    if (result.status !== 0) fail(`openclaw agents list failed; pass --team <file>: ${result.stderr || result.error?.message}`);
    agents = JSON.parse(result.stdout);
  }
  if (agents && !Array.isArray(agents) && Array.isArray(agents.agents)) agents = agents.agents;
  if (!Array.isArray(agents)) fail('team list must be a JSON array (or { agents: [...] })');
  const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const realMain = real(mainWorkspace);
  const list = agents
    .filter(a => a && typeof a.id === 'string' && typeof a.workspace === 'string' && path.isAbsolute(a.workspace))
    .map(a => ({ id: a.id, workspace: real(a.workspace), isMain: real(a.workspace) === realMain }));
  if (!list.some(a => a.isMain)) list.unshift({ id: 'main', workspace: realMain, isMain: true });
  const seen = new Set();
  return list.filter(a => (seen.has(a.workspace) ? false : seen.add(a.workspace)));
}

export function findAgent(team, id) {
  const agent = team.find(a => a.id === id);
  if (!agent) fail(`팀에 없는 에이전트예요: ${id} (unknown agent)`);
  return agent;
}
