import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Isolated local state: these checks never write to a deployed atlas.
const state = await mkdtemp(join(tmpdir(), 'places-browser-'));
const port = Number(process.env.BROWSER_TEST_PORT || 8794);
const base = `http://127.0.0.1:${port}`;
const screenshots = process.env.BROWSER_SCREENSHOT_DIR || 'test-results/browser';
await mkdir(screenshots, { recursive: true });
let logs = '';
const server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(port + 1000), '--persist-to', state], {
  detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || join(state, 'config') }
});
for (const output of [server.stdout, server.stderr]) output.on('data', chunk => { logs = (logs + chunk).slice(-30000); });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (server.exitCode !== null) throw new Error(`Local Worker exited: ${logs}`);
    try { const r = await fetch(base + '/api/health'); if (r.ok) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready, `Worker did not become ready: ${logs}`);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errors = [];
  async function context(viewport) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    // External map imagery/fonts are not part of these deterministic UI tests.
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(() => { try { localStorage.setItem('visitedPlaces.user.preferences.v1', JSON.stringify({ mapShape: 'panel' })); } catch {} });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    return context;
  }
  for (const [width, height] of [[320,740], [390,844], [768,1024], [1024,600], [1366,768], [1920,1080]]) {
    const ctx = await context({ width, height }); const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.sync-status').filter({ hasText: 'All collections up to date' }).waitFor();
    assert.equal(await page.locator('.place-name').count(), 91);
    assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, mapHeight: document.querySelector('.map-wrap').getBoundingClientRect().height }));
    assert.ok(geometry.width <= width, `Horizontal overflow at ${width}px: ${geometry.width}`);
    assert.ok(geometry.mapHeight >= 280, `Map collapsed at ${width}px`);
    await page.screenshot({ path: join(screenshots, `${width}.png`), fullPage: true });
    console.log(`Layout passed: ${width}×${height}; map ${Math.round(geometry.mapHeight)}px`);
    await ctx.close();
  }
  const ctx = await context({ width: 1366, height: 768 }); const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('.sync-status').filter({ hasText: 'All collections up to date' }).waitFor();
  await page.getByLabel('New person name').fill('Browser test traveler');
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Editing key for Browser test traveler').waitFor();
  const id = await page.getByLabel('Filter by person').inputValue();
  const key = await page.getByLabel('Editing key for Browser test traveler').inputValue();
  assert.ok(key.length >= 32); // Never print the capability.
  const place = { id: 'browser-fixture-place', userId: id, name: 'Test memory', lat: 10, lng: 20, notes: 'Original note' };
  const saved = page.waitForResponse(response => response.url().endsWith('/api/community/people/' + id) && response.request().method() === 'PUT' && response.status() === 200);
  await page.locator('input[type=file]').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ places: [place] })) });
  await saved;
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.place-edit textarea').fill('Updated and saved to cloud');
  const edited = page.waitForResponse(response => response.url().endsWith('/api/community/people/' + id) && response.request().method() === 'PUT' && response.status() === 200);
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await edited;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.place-note').filter({ hasText: 'Updated and saved to cloud' }).waitFor();
  // New phone browser has no key but sees the cloud record, then restores access.
  const phoneCtx = await context({ width: 390, height: 844 }); const phone = await phoneCtx.newPage();
  await phone.goto(base, { waitUntil: 'domcontentloaded' });
  await phone.getByLabel('Filter by person').selectOption(id);
  await phone.locator('.place-note').filter({ hasText: 'Updated and saved to cloud' }).waitFor();
  assert.equal(await phone.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
  await phone.getByRole('button', { name: 'Settings', exact: true }).click();
  await phone.getByLabel('Private editing key').fill(key);
  await phone.locator('.profile-row').getByRole('button', { name: 'Unlock editing', exact: true }).click();
  await phone.getByRole('button', { name: 'Places', exact: true }).click();
  await phone.getByRole('button', { name: 'Edit', exact: true }).waitFor();
  const denied = await phone.evaluate(async ({ key, base }) => {
    const r = await fetch(base + '/api/community/people/user_saboor', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ revision: 0, places: [] }) });
    return r.status;
  }, { key, base });
  assert.equal(denied, 401);
  await phone.getByLabel('Filter by person').selectOption('user_saboor');
  assert.equal(await phone.locator('.place-name').count(), 91);
  assert.equal(await phone.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('Cloud workflow passed: create, import, autosave, edit, reload, public second-device read, phone key recovery, Saboor protection.');
  let loadedGlobe = false;
  page.on('request', request => { if (request.url().includes('/dist/globe.gl-')) loadedGlobe = true; });
  await page.getByRole('button', { name: 'Globe', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.globe-host canvas') || document.querySelector('#world-map .leaflet-host'));
  assert.ok(loadedGlobe, '3D engine should be fetched on demand');
  assert.equal(await page.locator('.place-name').count(), 1);
  console.log(await page.locator('.globe-host canvas').count() ? 'Globe engine loaded and rendered.' : 'Globe engine loaded; WebGL fallback remained usable.');
  assert.deepEqual(errors, []);
  const restrictedCtx = await context({ width: 390, height: 844 });
  await restrictedCtx.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } }));
  const restricted = await restrictedCtx.newPage();
  await restricted.goto(base, { waitUntil: 'domcontentloaded' });
  await restricted.locator('.sync-status').filter({ hasText: 'All collections up to date' }).waitFor();
  assert.equal(await restricted.locator('.place-name').count(), 91);
  await restricted.getByLabel('New person name').fill('Storage unavailable');
  await restricted.getByRole('button', { name: 'Add person', exact: true }).click();
  await restricted.locator('.sync-status').filter({ hasText: 'Browser storage is unavailable' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Public reading remains available when browser storage is disabled.');
  await restrictedCtx.close();
  await phoneCtx.close(); await ctx.close();
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await rm(state, { recursive: true, force: true });
}
