#!/usr/bin/env node
// P0 tool: black-box probe for upstream @z_ai/mcp-server (stdio JSON-RPC)
// usage:
//   node scripts/upstream-probe.mjs <entryJs> list <outDir>
//   node scripts/upstream-probe.mjs <entryJs> call <outDir> <toolName> <argsJson>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , entry, mode, outDir, toolName, argsJson, label] = process.argv;

if (!entry || !['list', 'call'].includes(mode) || !outDir) {
  console.error('usage: node upstream-probe.mjs <entryJs> list|call <outDir> [toolName] [argsJson]');
  process.exit(2);
}

const child = spawn(process.execPath, [entry], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
});

const responses = new Map();
let stdoutBuf = '';
let stderrBuf = '';

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdoutBuf += chunk;
  let nl;
  while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { console.error('[probe] non-json stdout:', line.slice(0, 300)); continue; }
    if (msg.id !== undefined) {
      responses.set(String(msg.id), msg);
      console.error(`[probe] response id=${msg.id}${msg.error ? ' error=' + JSON.stringify(msg.error).slice(0, 300) : ''}`);
    }
  }
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (c) => { stderrBuf += c; });

const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(id, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (responses.has(String(id))) return true;
    await sleep(100);
  }
  return false;
}

let seq = 0;
const nextId = () => ++seq;

mkdirSync(outDir, { recursive: true });

const initId = nextId();
send({ jsonrpc: '2.0', id: initId, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vision-bridge-probe', version: '0.1.0' } } });
if (!(await waitFor(initId))) { console.error('[probe] initialize timeout'); process.exit(3); }
writeFileSync(join(outDir, 'initialize.json'), JSON.stringify(responses.get(String(initId)), null, 2));

send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
await sleep(150);

const listId = nextId();
send({ jsonrpc: '2.0', id: listId, method: 'tools/list', params: {} });
if (!(await waitFor(listId))) { console.error('[probe] tools/list timeout'); process.exit(3); }
const listResponse = responses.get(String(listId));
writeFileSync(join(outDir, 'tools-list.json'), JSON.stringify(listResponse, null, 2));
const tools = listResponse.result?.tools ?? [];
console.error(`[probe] tools=${tools.length}`);

if (mode === 'list') {
  child.kill();
  console.log(JSON.stringify({ ok: true, mode: 'list', tools: tools.length, outDir }));
  process.exit(0);
}

if (!toolName || !argsJson) { console.error('[probe] call mode requires toolName and argsJson'); process.exit(2); }
const argsRaw = argsJson.startsWith('@') ? readFileSync(argsJson.slice(1), 'utf8') : argsJson;
const args = JSON.parse(argsRaw);
const callId = nextId();
send({ jsonrpc: '2.0', id: callId, method: 'tools/call', params: { name: toolName, arguments: args } });
if (!(await waitFor(callId, 180000))) { console.error('[probe] tools/call timeout'); process.exit(3); }
const callResponse = responses.get(String(callId));
const isError = Boolean(callResponse.error) || (callResponse.result && callResponse.result.isError);
const sub = isError ? 'tool-errors' : 'tool-results';
mkdirSync(join(outDir, sub), { recursive: true });
const safeName = (label ?? toolName).replace(/[^a-z0-9_-]/gi, '_');
writeFileSync(join(outDir, sub, `${safeName}.json`), JSON.stringify(callResponse, null, 2));
child.kill();
console.log(JSON.stringify({ ok: true, mode: 'call', tool: toolName, isError, out: `${sub}/${safeName}.json` }));
process.exit(0);