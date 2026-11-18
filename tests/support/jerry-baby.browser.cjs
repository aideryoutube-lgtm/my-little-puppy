// Run against a local server or the private Preview using Playwright Chromium.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

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
      assert.equal(await page.locator(`[data-room="${origin}"]`).getAttribute('aria-pressed'), 'true');
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
