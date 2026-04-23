import type { LogLevel } from '../../transport/schema';
import type { HttpMethod, StatusBucket } from '../../store/filters';
import type { EventSource } from '../../transport/schema';

export const SOURCE_TONES: Record<EventSource, { bg: string; fg: string; brd: string }> = {
  HTTP: { bg: 'bg-src-http-bg', fg: 'text-src-http-fg', brd: 'border-src-http-brd' },
  LOG: { bg: 'bg-src-log-bg', fg: 'text-src-log-fg', brd: 'border-src-log-brd' },
  CUSTOM: { bg: 'bg-src-custom-bg', fg: 'text-src-custom-fg', brd: 'border-src-custom-brd' },
};

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-method-get-fg',
  POST: 'text-method-post-fg',
  PUT: 'text-method-put-fg',
  PATCH: 'text-method-patch-fg',
  DELETE: 'text-method-del-fg',
  HEAD: 'text-method-head-fg',
  OPTIONS: 'text-method-opt-fg',
  OTHER: 'text-fg-2',
};

export const STATUS_BUCKET_DOTS: Record<StatusBucket, string> = {
  '2xx': 'bg-status-2xx-dot',
  '3xx': 'bg-status-3xx-dot',
  '4xx': 'bg-status-4xx-dot',
  '5xx': 'bg-status-5xx-dot',
  err: 'bg-status-err-dot',
};

export const STATUS_BUCKET_TEXT: Record<StatusBucket, string> = {
  '2xx': 'text-status-2xx-fg',
  '3xx': 'text-status-3xx-fg',
  '4xx': 'text-status-4xx-fg',
  '5xx': 'text-status-5xx-fg',
  err: 'text-status-err-fg',
};

export const LEVEL_TONES: Record<LogLevel, { fg: string; bg: string }> = {
  Error: { fg: 'text-log-error-fg', bg: 'bg-log-error-bg' },
  Warning: { fg: 'text-log-warn-fg', bg: 'bg-log-warn-bg' },
  Info: { fg: 'text-log-info-fg', bg: 'bg-log-info-bg' },
  Debug: { fg: 'text-log-debug-fg', bg: 'bg-log-debug-bg' },
  Verbose: { fg: 'text-log-verbose-fg', bg: 'bg-log-verbose-bg' },
};
