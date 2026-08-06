import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const DEFAULT_LOG_FILE_PATH = fileURLToPath(new URL('../.audit/logs/bridge.log', import.meta.url));
let logFile: string | null = null;
let fileReady = false;

export function configureLogFile(path: string | null): void {
  logFile = path;
  fileReady = false;
}

function writeFileLine(record: Record<string, unknown>): void {
  if (!logFile) return;
  try {
    if (!fileReady) {
      mkdirSync(dirname(logFile), { recursive: true });
      fileReady = true;
    }
    appendFileSync(logFile, JSON.stringify(record) + '\n');
  } catch {
    // 文件日志失败不影响主流程
  }
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  process.stderr.write(`[vision-bridge] ${record.ts} ${level.toUpperCase()} ${message}` + (meta ? ` ${JSON.stringify(meta)}` : '') + '\n');
  writeFileLine(record);
}

export function redact(value: string): string {
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '***';
}