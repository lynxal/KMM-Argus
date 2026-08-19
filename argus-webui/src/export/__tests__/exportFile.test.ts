import { describe, it, expect } from 'vitest';
import {
  bodyDownloadPayload,
  bodyFileName,
  buildEventsExport,
  eventsFileName,
  type EventsExport,
} from '../exportFile';
import { ARGUS_SCHEMA_VERSION, type ArgusEvent, type DeviceInfo } from '../../transport/schema';

function log(id: string, timestamp: number): ArgusEvent {
  return {
    type: 'LogEvent',
    id,
    timestamp,
    source: 'LOG',
    level: 'Info',
    tag: 't',
    message: `m-${id}`,
    payload: {},
    throwable: null,
  };
}

const DEVICE: DeviceInfo = {
  name: 'Pixel 8',
  address: '192.168.1.42:9090',
  platform: 'android',
  version: '1.4.2',
  pkg: 'com.example.app',
};

/** Store order: `ingest` appends, so the list is oldest-first. */
const STORE_ORDER = [log('a', 100), log('b', 200), log('c', 300)];

describe('buildEventsExport', () => {
  it('carries the schema version, count and device', () => {
    const parsed = JSON.parse(buildEventsExport(STORE_ORDER, DEVICE, 1_700_000_000_000)) as EventsExport;
    expect(parsed.argusSchemaVersion).toBe(ARGUS_SCHEMA_VERSION);
    expect(parsed.eventCount).toBe(3);
    expect(parsed.device).toEqual(DEVICE);
    expect(parsed.exportedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('preserves store order, which is oldest-first and matches the rows on screen', () => {
    const parsed = JSON.parse(buildEventsExport(STORE_ORDER, DEVICE, 0)) as EventsExport;
    expect(parsed.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('writes timestamps in ascending order', () => {
    const parsed = JSON.parse(buildEventsExport(STORE_ORDER, DEVICE, 0)) as EventsExport;
    const stamps = parsed.events.map((e) => e.timestamp);
    expect(stamps).toEqual([...stamps].sort((x, y) => x - y));
  });

  it('does not reorder an out-of-order list — the store is the authority', () => {
    const parsed = JSON.parse(buildEventsExport([log('c', 300), log('a', 100)], DEVICE, 0)) as EventsExport;
    expect(parsed.events.map((e) => e.id)).toEqual(['c', 'a']);
  });

  it('does not mutate the input array', () => {
    const input = [...STORE_ORDER];
    buildEventsExport(input, DEVICE, 0);
    expect(input.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('stays valid JSON with no device and no events', () => {
    const parsed = JSON.parse(buildEventsExport([], null, 0)) as EventsExport;
    expect(parsed.device).toBeNull();
    expect(parsed.eventCount).toBe(0);
    expect(parsed.events).toEqual([]);
  });
});

describe('eventsFileName', () => {
  it('uses the package name and a local timestamp', () => {
    expect(eventsFileName(DEVICE, Date.now())).toMatch(/^argus-com\.example\.app-\d{8}-\d{6}\.json$/);
  });

  it('falls back when the device is unknown', () => {
    expect(eventsFileName(null, Date.now())).toMatch(/^argus-events-\d{8}-\d{6}\.json$/);
  });

  it('sanitises a package name that would break a filename', () => {
    expect(eventsFileName({ ...DEVICE, pkg: 'com/example app:debug' }, 0)).toMatch(
      /^argus-com-example-app-debug-\d{8}-\d{6}\.json$/,
    );
  });
});

describe('bodyFileName', () => {
  it('picks the extension from the resolved mode', () => {
    expect(bodyFileName('argus-log-1-raw', 'json', 'application/json', false)).toBe('argus-log-1-raw.json');
    expect(bodyFileName('argus-log-1-raw', 'text', 'text/plain', false)).toBe('argus-log-1-raw.txt');
    expect(bodyFileName('argus-log-1-raw', 'hex', null, false)).toBe('argus-log-1-raw.bin');
  });

  it('picks the image extension from the content type', () => {
    expect(bodyFileName('img', 'image', 'image/jpeg', false)).toBe('img.jpg');
    expect(bodyFileName('img', 'image', 'image/png; charset=binary', false)).toBe('img.png');
    expect(bodyFileName('img', 'image', 'image/svg+xml', false)).toBe('img.svg');
    expect(bodyFileName('img', 'image', 'application/weird', false)).toBe('img.bin');
  });

  it('marks a truncated body before the extension', () => {
    expect(bodyFileName('argus-http-9-response', 'json', 'application/json', true)).toBe(
      'argus-http-9-response-truncated.json',
    );
  });

  it('sanitises the base name — event ids reach it raw', () => {
    expect(bodyFileName('argus-http-a/b c-raw', 'json', null, false)).toBe('argus-http-a-b-c-raw.json');
  });
});

describe('bodyDownloadPayload', () => {
  it('passes text-ish bodies through untouched', () => {
    const body = '{"a":1}';
    expect(bodyDownloadPayload(body, 'json', 'application/json')).toEqual({
      mime: 'application/json',
      data: body,
    });
  });

  it('defaults the mime from the mode when there is no content type', () => {
    expect(bodyDownloadPayload('hi', 'text', null).mime).toBe('text/plain');
    expect(bodyDownloadPayload('{}', 'json', null).mime).toBe('application/json');
    expect(bodyDownloadPayload('hi', 'hex', null).mime).toBe('application/octet-stream');
  });

  it('decodes bare base64 and a data URL to the same bytes', () => {
    const base64 = 'iVBORw0KGgo=';
    const bare = bodyDownloadPayload(base64, 'image', 'image/png');
    const dataUrl = bodyDownloadPayload(`data:image/png;base64,${base64}`, 'image', null);
    expect(bare.data).toBeInstanceOf(Uint8Array);
    expect(bare.mime).toBe('image/png');
    expect(dataUrl.mime).toBe('image/png');
    expect([...(dataUrl.data as Uint8Array)]).toEqual([...(bare.data as Uint8Array)]);
    expect([...(bare.data as Uint8Array)].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
