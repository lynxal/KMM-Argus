/**
 * Wire contract mirrored from argus-core/src/commonMain/kotlin/com/lynxal/argus/model/.
 * Hand-maintained — when the Kotlin schema changes, bump ARGUS_SCHEMA_VERSION
 * on both sides so the UI rejects incompatible streams on Hello.
 *
 * @see argus-core/src/commonMain/kotlin/com/lynxal/argus/model/ArgusEvent.kt
 * @see argus-core/src/commonMain/kotlin/com/lynxal/argus/model/Schema.kt
 */
export const ARGUS_SCHEMA_VERSION = 1 as const;

export type EventSource = 'HTTP' | 'LOG' | 'CUSTOM';
export type Direction = 'INBOUND' | 'OUTBOUND' | 'NONE';
/** Upstream KMMLogging enum names — see LogLevelSerializer.kt. */
export type LogLevel = 'Verbose' | 'Debug' | 'Info' | 'Warning' | 'Error';

export interface Header {
  name: string;
  value: string;
  redacted?: boolean;
}

export interface HttpRequest {
  method: string;
  url: string;
  host: string;
  path: string;
  headers: Header[];
  bodyPreview?: string | null;
  bodyTruncatedTotalBytes?: number | null;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export interface HttpResponse {
  statusCode: number;
  statusText: string;
  headers: Header[];
  bodyPreview?: string | null;
  bodyTruncatedTotalBytes?: number | null;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export interface HttpError {
  throwableClass: string;
  message?: string | null;
  stackTrace: string;
}

export interface ThrowableInfo {
  className: string;
  message?: string | null;
  stackTrace: string;
  cause?: ThrowableInfo | null;
}

/** Polymorphic discriminator matches the `type` key kotlinx.serialization uses. */
export interface HttpEvent {
  type: 'HttpEvent';
  id: string;
  timestamp: number;
  source: 'HTTP';
  request: HttpRequest;
  response?: HttpResponse | null;
  error?: HttpError | null;
  durationMs?: number | null;
}

export interface LogEvent {
  type: 'LogEvent';
  id: string;
  timestamp: number;
  source: 'LOG';
  level: LogLevel;
  tag?: string | null;
  message: string;
  payload: Record<string, string>;
  throwable?: ThrowableInfo | null;
}

export interface CustomEvent {
  type: 'CustomEvent';
  id: string;
  timestamp: number;
  source: 'CUSTOM';
  sourceLabel: string;
  label: string;
  direction: Direction;
  payload: string;
  metadata: Record<string, string>;
}

export type ArgusEvent = HttpEvent | LogEvent | CustomEvent;

export const isHttpEvent = (e: ArgusEvent): e is HttpEvent => e.type === 'HttpEvent';
export const isLogEvent = (e: ArgusEvent): e is LogEvent => e.type === 'LogEvent';
export const isCustomEvent = (e: ArgusEvent): e is CustomEvent => e.type === 'CustomEvent';

/** First WebSocket frame — mirrors HelloPayload in argus-core/model/Schema.kt. */
export interface HelloFrame {
  type: 'Hello';
  schemaVersion: number;
  serverName: string;
  serverVersion?: string | null;
}

/** Keepalive frame. UI tracks arrival time for reconnecting/disconnected state. */
export interface PingFrame {
  type: 'Ping';
  timestamp: number;
}

export type StreamFrame = HelloFrame | PingFrame | ArgusEvent;

export interface DeviceInfo {
  name: string;
  address: string;
  platform: 'android' | 'ios' | 'jvm';
  version: string;
}

/** UI-facing helpers — label/category maps kept next to the wire types. */
export function statusClass(code: number | null | undefined): '2xx' | '3xx' | '4xx' | '5xx' | 'err' {
  if (code == null) return 'err';
  const k = Math.floor(code / 100);
  if (k === 2) return '2xx';
  if (k === 3) return '3xx';
  if (k === 4) return '4xx';
  if (k === 5) return '5xx';
  return 'err';
}

/**
 * UI chip label for a wire LogLevel. The wire uses Kotlin enum names
 * (Verbose/Debug/...); the design labels are short-caps (VERB/DEBUG/...).
 */
export const LOG_LEVEL_LABELS: Record<LogLevel, 'VERB' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'> = {
  Verbose: 'VERB',
  Debug: 'DEBUG',
  Info: 'INFO',
  Warning: 'WARN',
  Error: 'ERROR',
};
