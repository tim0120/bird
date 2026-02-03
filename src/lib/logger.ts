import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

function getLogPath(): string {
  const home = homedir();
  if (platform() === 'darwin') {
    // macOS: ~/Library/Logs/bird-fork.log
    return join(home, 'Library', 'Logs', 'bird-fork.log');
  }
  // Linux/other: ~/.local/share/bird-fork/bird.log
  const dir = join(home, '.local', 'share', 'bird-fork');
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return join(dir, 'bird.log');
}

const LOG_FILE = getLogPath();

export function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  const line = `[${timestamp}] [${level}] ${message}${dataStr}\n`;

  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Silently fail if we can't write to log
  }
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log('INFO', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log('WARN', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log('ERROR', msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => log('DEBUG', msg, data),
};
