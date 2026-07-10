import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameServer } from '../server/index.js';

test('HTTP serves game shell, modules, vendor and every required UI marker', async (t) => {
  const game = createGameServer({ port: 0, startRoom: false });
  const address = await game.listen();
  t.after(() => game.close());
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const markers = [
    'id="hotbar"', 'id="equipped-label"', 'data-control="fire"',
    'data-control="aim"', 'data-control="jump"', 'data-control="action"',
    'data-control="crouch-prone"', 'data-control="dynamic-move-zone"',
    'data-ui="faction-score-hud"', 'data-ui="capture-hud"',
    'data-ui="resource-hud"', 'data-ui="death-overlay"',
    'data-ui="victory-overlay"', 'data-ui="onboarding-help"',
    'data-ui="minimap"', 'data-ui="class-objective"'
  ];
  for (const marker of markers) assert.ok(html.includes(marker), `missing ${marker}`);

  for (const path of ['/game.js', '/net.js', '/mobile-layout.js', '/vendor/three.module.js']) {
    const asset = await fetch(`${base}${path}`);
    assert.equal(asset.status, 200, `${path} should load`);
    assert.ok((await asset.text()).length > 100);
  }
});
