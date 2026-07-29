import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

const logDir = join(app.getPath('userData'), 'logs');
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const logFile = join(logDir, `tdlib-${new Date().toISOString().slice(0, 10)}.log`);
if (!existsSync(logFile)) {
  writeFileSync(logFile, '', 'utf-8');
}

function write(type: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)
  ).join(' ');
  const line = `[${timestamp}][${type}] ${message}`;

  console.log(line);
  try {
    appendFileSync(logFile, line + '\n', 'utf-8');
  } catch { }
}

export const logger = {
  info: (...args: unknown[]) => write('INFO', ...args),
  warn: (...args: unknown[]) => write('WARN', ...args),
  error: (...args: unknown[]) => write('ERROR', ...args),
  tdlib: {
    send: (method: string, args: Record<string, unknown>) =>
      write('TDLIB_SEND', `${method} ${JSON.stringify(args)}`),
    receive: (update: Record<string, unknown>) => {
      const type = update._ as string || 'unknown';
      if (type === 'updateAuthorizationState') {
        write('TDLIB_AUTH', JSON.stringify(update.authorization_state));
      } else if (
        type === 'updateNewMessage' ||
        type === 'updateChatLastMessage'
      ) {
        write('TDLIB_UPDATE', type);
      } else {
        write('TDLIB_UPDATE', type);
      }
    },
    error: (error: Error | Record<string, unknown>) =>
      write('TDLIB_ERROR', error instanceof Error ? error.message : JSON.stringify(error)),
    close: () => write('TDLIB_CLOSE', 'client closed'),
    invoke: (method: string) => write('TDLIB_INVOKE', method),
  },
};
