import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getMobileRects, joystickIntent, overlapCount } from '../public/mobile-layout.js';

test('dynamic joystick strong forward threshold enables sprint without a sprint button', () => {
  assert.equal(joystickIntent(0, -57).sprint, true);
  assert.equal(joystickIntent(0, -30).sprint, false);
  assert.equal(joystickIntent(57, 0).sprint, false);
  assert.equal(joystickIntent(18, -56).sprint, true);
});

test('390x844 critical mobile geometry has zero overlaps', () => {
  const rects = getMobileRects(390, 844);
  assert.equal(overlapCount(rects), 0);
});

test('mobile controls include dynamic zone, combat, jump, action and stance but no sprint marker', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const marker of ['dynamic-move-zone', 'data-control="fire"', 'data-control="aim"', 'data-control="jump"', 'data-control="action"', 'data-control="crouch-prone"']) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
  assert.ok(!html.includes('mobile-sprint'));
  assert.ok(!html.includes('data-control="sprint"'));
});

test('mobile Action and desktop E call the shared interaction function', async () => {
  const source = await readFile(new URL('../public/game.js', import.meta.url), 'utf8');
  assert.match(source, /KeyE[^\n]+performContextAction/);
  assert.match(source, /mobile-action[\s\S]{0,700}else performContextAction\(\)/);
});
