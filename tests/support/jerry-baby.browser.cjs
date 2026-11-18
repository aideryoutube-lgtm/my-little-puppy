// Run against a local server or the private Preview using Playwright Chromium.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const actions = [
  ['#food', ['WalkToBowl', 'Eat', 'WalkHome']],
  ['#sleep', ['WalkToBed', 'LieDown', 'Sleep', 'WakeUp', 'SleepWalkHome']],
  ['#bath', ['WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome']],
  ['#ball', ['WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome']],
  ['#home', ['WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome']],
  ['[data-kitchen-water]', ['WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome']],
  ['[data-dress-item="baby-blue-shirt"]', ['DressTurn']],
  ['#portrait', ['Happy']],
];

async function verifyFeeding(page) {
  const viewer = page.locator('#jerryBaby3D');
  const bowl = page.locator('#babyFoodBowl');
  const room = page.locator('#roomCanvas');
  const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('jerry-save-v1')));
  const waitForClip = (name, time) => page.waitForFunction(([name, time]) => {
    const model = document.getElementById('jerryBaby3D');
    return model.animationName === name && !model.paused && model.currentTime >= time;
  }, [name, time], { timeout: 10000 });
  const idle = () => page.waitForFunction(() =>
    document.querySelector('#jerryBaby3D').animationName === 'Idle' &&
    !document.getElementById('scene').hasAttribute('data-care-busy'));
  const screenshots = process.env.PAWTOPIA_SCREENSHOTS;
  if (screenshots) mkdirSync(screenshots, { recursive: true });
  const capture = name => screenshots && room.screenshot({ path: join(screenshots, name + '.png') });
  await page.locator('[data-room="kitchen"]').tap();
  await idle();
  const start = await viewer.boundingBox();
  const initial = await save();
  await capture('01-empty-bowl');
  for (let meal = 1; meal <= 2; meal++) {
    await page.locator('#food').tap();
    await waitForClip('WalkToBowl', 0.25);
    assert.equal(await bowl.getAttribute('data-food-level'), '100');
    if (meal === 1) await capture('02-approach');
    await waitForClip('Eat', 0.1);
    const atBowl = await viewer.boundingBox();
    assert(Math.hypot(atBowl.x - start.x, atBowl.y - start.y) > 1);
    assert.equal((await save()).feedCount, initial.feedCount + meal - 1);
    for (const level of [75, 50, 25]) {
      await page.waitForFunction(level =>
        Number(document.getElementById('babyFoodBowl').dataset.foodLevel) <= level, level);
      if (meal === 1) await capture('03-eating-' + level);
    }
    await waitForClip('WalkHome', 0.15);
    assert.equal(await bowl.getAttribute('data-food-level'), '0');
    if (meal === 1) await capture('04-return');
    await idle();
    const home = await viewer.boundingBox();
    assert(Math.hypot(home.x - start.x, home.y - start.y) < 1);
    const saved = await save();
    assert.equal(saved.feedCount, initial.feedCount + meal);
    assert.equal(saved.hunger, Math.min(100, initial.hunger + 35 * meal));
  }
  const beforeCancel = await save();
  await page.locator('#food').tap();
  await waitForClip('WalkToBowl', 0.25);
  await page.locator('[data-room="living"]').tap();
  await idle();
  assert.equal(await bowl.getAttribute('data-food-level'), '0');
  assert.equal((await save()).feedCount, beforeCancel.feedCount);
  await page.reload();
  assert.equal((await save()).hunger, beforeCancel.hunger);
  console.log('Feed: two complete meals, bowl depletion, return, cancellation and saved Hunger');
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    const httpCredentials = process.env.PREVIEW_USER && process.env.PREVIEW_PASSWORD
      ? { username: process.env.PREVIEW_USER, password: process.env.PREVIEW_PASSWORD }
      : undefined;
    const context = await browser.newContext({
      httpCredentials, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(process.env.PAWTOPIA_URL || 'http://127.0.0.1:4173');
    assert(response.ok(), 'Playwright requires an accessible, authorized Preview');
    const viewer = page.locator('#jerryBaby3D');
    await page.waitForFunction(() => document.querySelector('#jerryBaby3D')?.loaded);
    await verifyFeeding(page);
    for (const [button, clips] of actions) {
      const origin = button === '[data-kitchen-water]' ? 'kitchen' : 'living';
      await page.locator(`[data-room="${origin}"]`).tap();
      if (button.startsWith('[data-dress-item')) await page.locator('#dress').tap();
      await page.locator(button).tap();
      for (const name of clips) {
        // Observe elapsed mixer time in the real renderer for each distinct clip.
        await page.waitForFunction(clip => {
          const model = document.getElementById('jerryBaby3D');
          return model.animationName === clip && !model.paused && model.currentTime > 0.15;
        }, name, { timeout: 8000 });
      }
      await page.waitForFunction(() => {
        const model = document.getElementById('jerryBaby3D');
        return model.animationName === 'Idle' && !document.getElementById('scene').hasAttribute('data-care-busy');
      }, null, { timeout: 8000 });
      assert.equal(await page.locator(`[data-room="${button === '#food' ? 'kitchen' : origin}"]`).getAttribute('aria-pressed'), 'true');
      console.log(button, 'advanced through all clips and returned to Idle');
    }
    const before = await page.evaluate(() => window.pawtopiaWorld.snapshot());
    await page.reload();
    await viewer.waitFor();
    const after = await page.evaluate(() => window.pawtopiaWorld.snapshot());
    assert.equal(after.xp, before.xp);
    assert.deepEqual(after.world.equipped, before.world.equipped);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
