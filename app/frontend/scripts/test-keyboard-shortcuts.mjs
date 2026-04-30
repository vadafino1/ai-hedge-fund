import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importTypeScriptModule } from './import-typescript-module.mjs';

const {
  createKeyboardShortcutHandler,
} = await importTypeScriptModule('src/hooks/keyboard-shortcut-matcher.ts');

function keyEvent(overrides = {}) {
  let defaultPrevented = false;
  return {
    key: 'z',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
    ...overrides,
  };
}

function matchingCalls(shortcut, events) {
  return events.map(event => {
    let calls = 0;
    const handler = createKeyboardShortcutHandler([{ ...shortcut, callback: () => { calls += 1; } }]);
    handler(event);
    return calls;
  });
}

describe('keyboard shortcut matching', () => {
  it('matches Ctrl or Cmd when a shortcut declares a primary modifier', () => {
    const shortcut = { key: 'z', ctrlKey: true, metaKey: true };

    assert.deepEqual(matchingCalls(shortcut, [
      keyEvent({ key: 'Z', ctrlKey: true }),
      keyEvent({ key: 'z', metaKey: true }),
      keyEvent({ key: 'z' }),
    ]), [1, 1, 0]);
  });

  it('requires configured shift and alt modifiers for primary-modifier shortcuts', () => {
    const redo = { key: 'z', ctrlKey: true, metaKey: true, shiftKey: true };
    const undo = { key: 'z', ctrlKey: true, metaKey: true };

    assert.deepEqual(matchingCalls(redo, [
      keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }),
      keyEvent({ key: 'z', ctrlKey: true }),
    ]), [1, 0]);

    assert.deepEqual(matchingCalls(undo, [
      keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }),
      keyEvent({ key: 'z', ctrlKey: true, altKey: true }),
    ]), [0, 0]);
  });

  it('matches plain shortcuts only when no modifiers are pressed', () => {
    const shortcut = { key: 'Escape' };

    assert.deepEqual(matchingCalls(shortcut, [
      keyEvent({ key: 'escape' }),
      keyEvent({ key: 'Escape', ctrlKey: true }),
      keyEvent({ key: 'Escape', shiftKey: true }),
    ]), [1, 0, 0]);
  });

  it('preserves legacy save-shortcut behavior with extra shift or alt modifiers', () => {
    const save = { key: 's', ctrlKey: true, metaKey: true };

    assert.deepEqual(matchingCalls(save, [
      keyEvent({ key: 's', ctrlKey: true, shiftKey: true }),
      keyEvent({ key: 's', metaKey: true, altKey: true }),
      keyEvent({ key: 'x', ctrlKey: true, shiftKey: true }),
    ]), [1, 1, 0]);
  });
});

describe('createKeyboardShortcutHandler', () => {
  it('runs every matching shortcut and respects preventDefault settings', () => {
    const calls = [];
    const event = keyEvent({ key: 'Enter', ctrlKey: true });
    const handler = createKeyboardShortcutHandler([
      { key: 'Enter', ctrlKey: true, callback: () => calls.push('default') },
      { key: 'Enter', ctrlKey: true, callback: () => calls.push('allowed'), preventDefault: false },
      { key: 'Enter', shiftKey: true, callback: () => calls.push('miss') },
    ]);

    handler(event);

    assert.deepEqual(calls, ['default', 'allowed']);
    assert.equal(event.defaultPrevented, true);
  });
});
