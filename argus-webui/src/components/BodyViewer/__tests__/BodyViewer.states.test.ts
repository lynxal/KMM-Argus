import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_OPEN_DEPTH,
  isNodeOpen,
  jsonChildPath,
  JSON_ROOT_PATH,
  MAX_TRACKED_PANES,
  resetJsonExpandState,
  setNodeOpen,
  trackedNodeCount,
} from '../BodyViewer.states';

/** Depths either side of the default, named so the cases read as intent. */
const DEEP = DEFAULT_OPEN_DEPTH; // collapsed unless the reader says otherwise
const SHALLOW = DEFAULT_OPEN_DEPTH - 1; // open unless the reader says otherwise

beforeEach(resetJsonExpandState);

describe('jsonChildPath', () => {
  it('nests under the parent', () => {
    const data = jsonChildPath(JSON_ROOT_PATH, 'data');
    expect(data).toBe('/data');
    expect(jsonChildPath(data, 'user')).toBe('/data/user');
  });

  it('indexes array elements by position', () => {
    expect(jsonChildPath('/roles', '2')).toBe('/roles/2');
  });

  it('keeps a key containing a slash from reading as a nesting level', () => {
    expect(jsonChildPath('', 'a/b')).toBe('/a~1b');
    expect(jsonChildPath('', 'a/b')).not.toBe(jsonChildPath(jsonChildPath('', 'a'), 'b'));
  });

  it('keeps an escape inside a key from colliding with the escaping', () => {
    // The literal key "a~1b" must not land on the same path as the key "a/b".
    expect(jsonChildPath('', 'a~1b')).toBe('/a~01b');
    expect(jsonChildPath('', 'a~1b')).not.toBe(jsonChildPath('', 'a/b'));
    expect(jsonChildPath('', '~')).toBe('/~0');
  });
});

describe('isNodeOpen', () => {
  it('opens the top levels by default', () => {
    for (let depth = 0; depth < DEFAULT_OPEN_DEPTH; depth++) {
      expect(isNodeOpen('pane', '/a', depth)).toBe(true);
    }
    expect(isNodeOpen('pane', '/a', DEFAULT_OPEN_DEPTH)).toBe(false);
  });

  it('honours an expansion the reader made on a deep node', () => {
    setNodeOpen('pane', '/data/user', true, DEEP);
    expect(isNodeOpen('pane', '/data/user', DEEP)).toBe(true);
  });

  it('honours a collapse the reader made on a default-open node', () => {
    setNodeOpen('pane', '/data', false, SHALLOW);
    expect(isNodeOpen('pane', '/data', SHALLOW)).toBe(false);
  });

  it('keeps panes independent, so one event’s two bodies do not share state', () => {
    setNodeOpen('http-1-response', '/data/user', true, DEEP);
    expect(isNodeOpen('http-1-request', '/data/user', DEEP)).toBe(false);
    expect(isNodeOpen('http-2-response', '/data/user', DEEP)).toBe(false);
  });

  it('falls back to the default without a pane key', () => {
    setNodeOpen(undefined, '/data/user', true, DEEP);
    expect(isNodeOpen(undefined, '/data/user', DEEP)).toBe(false);
    expect(isNodeOpen(undefined, '/data', SHALLOW)).toBe(true);
  });
});

describe('only deviations are kept', () => {
  it('ignores a write that only restates the default', () => {
    // A `<details>` fires `toggle` for the programmatic `open = true` that renders
    // it, so every default-open node reports itself. Recording those would put the
    // whole tree in the map and pin today's default into it.
    setNodeOpen('pane', '/data', true, SHALLOW);
    setNodeOpen('pane', '/data/user', false, DEEP);
    expect(trackedNodeCount('pane')).toBe(0);
  });

  it('forgets a node toggled back to its default', () => {
    setNodeOpen('pane', '/data/user', true, DEEP);
    expect(trackedNodeCount('pane')).toBe(1);

    setNodeOpen('pane', '/data/user', false, DEEP);
    expect(trackedNodeCount('pane')).toBe(0);
    expect(isNodeOpen('pane', '/data/user', DEEP)).toBe(false);
  });
});

describe('pane eviction', () => {
  it('forgets the least recently written pane past the cap', () => {
    setNodeOpen('oldest', '/a', true, DEEP);
    for (let i = 0; i < MAX_TRACKED_PANES; i++) setNodeOpen(`pane-${i}`, '/a', true, DEEP);

    expect(isNodeOpen('oldest', '/a', DEEP)).toBe(false);
    expect(isNodeOpen('pane-0', '/a', DEEP)).toBe(true);
    expect(isNodeOpen(`pane-${MAX_TRACKED_PANES - 1}`, '/a', DEEP)).toBe(true);
  });

  it('writing to a pane again keeps it alive', () => {
    setNodeOpen('kept', '/a', true, DEEP);
    for (let i = 0; i < MAX_TRACKED_PANES - 1; i++) setNodeOpen(`pane-${i}`, '/a', true, DEEP);
    setNodeOpen('kept', '/b', true, DEEP);
    setNodeOpen('one-more', '/a', true, DEEP);

    expect(isNodeOpen('kept', '/a', DEEP)).toBe(true);
    expect(isNodeOpen('pane-0', '/a', DEEP)).toBe(false);
  });
});
