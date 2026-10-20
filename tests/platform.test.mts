import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPlatform, hasPrimaryModifier, rewindWheelDelta, shortcutKeyLabel } from '../src/lib/platform.ts';

const ctrl = { ctrlKey: true, metaKey: false, altKey: false };
const cmd = { ctrlKey: false, metaKey: true, altKey: false };

test('platform and labels agree with native editing shortcuts', () => {
  assert.equal(detectPlatform('MacIntel'), 'macos');
  assert.equal(detectPlatform('Win32'), 'windows');
  assert.equal(detectPlatform('Linux x86_64'), 'other');
  assert.equal(shortcutKeyLabel('Cmd', 'windows'), 'Ctrl');
  assert.equal(shortcutKeyLabel('Opt', 'windows'), 'Alt');
  assert.equal(shortcutKeyLabel('Cmd', 'macos'), 'Cmd');
});

test('Windows shortcuts use Ctrl, never AltGr or the Windows key', () => {
  assert.equal(hasPrimaryModifier(ctrl, 'windows'), true);
  assert.equal(hasPrimaryModifier(cmd, 'windows'), false);
  assert.equal(hasPrimaryModifier({ ...ctrl, altKey: true }, 'windows'), false);
  assert.equal(hasPrimaryModifier({ ...ctrl, metaKey: true }, 'windows'), false);
});

test('macOS still uses Cmd and ignores Ctrl and alternate modifiers', () => {
  assert.equal(hasPrimaryModifier(cmd, 'macos'), true);
  assert.equal(hasPrimaryModifier(ctrl, 'macos'), false);
  assert.equal(hasPrimaryModifier({ ...cmd, ctrlKey: true }, 'macos'), false);
  assert.equal(hasPrimaryModifier({ ...cmd, altKey: true }, 'macos'), false);
});

test('Rewind handles wheel lines, pages and Shift horizontal scrolling', () => {
  assert.equal(rewindWheelDelta({ deltaY: -120, deltaX: 0, deltaMode: 0 }, 800), -120);
  assert.equal(rewindWheelDelta({ deltaY: 0, deltaX: 3, deltaMode: 1 }, 800), 48);
  assert.equal(rewindWheelDelta({ deltaY: 1, deltaX: 0, deltaMode: 2 }, 800), 800);
});
