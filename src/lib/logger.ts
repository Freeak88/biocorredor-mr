type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ClientLogEntry {
  id: string;
  level: LogLevel;
  scope: string;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

const MAX_LOGS = 250;

declare global {
  interface Window {
    __FUNGIMAP_LOGS__?: ClientLogEntry[];
  }
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const extra = error as Error & {
      status?: number;
      url?: string;
      response?: unknown;
      data?: unknown;
      originalError?: unknown;
    };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: extra.status,
      url: extra.url,
      response: extra.response,
      data: extra.data,
      originalError: extra.originalError,
    };
  }

  if (typeof error === 'object' && error !== null) {
    return { ...error as Record<string, unknown> };
  }

  return { message: String(error) };
}

function pushLog(entry: ClientLogEntry) {
  if (typeof window === 'undefined') return;
  const logs = window.__FUNGIMAP_LOGS__ ?? [];
  logs.unshift(entry);
  window.__FUNGIMAP_LOGS__ = logs.slice(0, MAX_LOGS);
}

export function logClientEvent(
  level: LogLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
) {
  const entry: ClientLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    context,
    error: error === undefined ? undefined : normalizeError(error),
  };

  pushLog(entry);

  const method = level === 'debug' ? 'debug' : level;
  console[method](`[FungiMap:${scope}] ${message}`, {
    context,
    error: entry.error,
    logId: entry.id,
  });
}

export function logError(scope: string, message: string, error: unknown, context?: Record<string, unknown>) {
  logClientEvent('error', scope, message, context, error);
}

export function logInfo(scope: string, message: string, context?: Record<string, unknown>) {
  logClientEvent('info', scope, message, context);
}

export function installGlobalErrorLogging() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    logError('runtime', event.message || 'Unhandled runtime error', event.error ?? event.message, {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError('runtime', 'Unhandled promise rejection', event.reason);
  });
}
