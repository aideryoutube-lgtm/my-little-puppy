const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mount } = require('./support/mini-harness.cjs');

function setup(t, xp, mode = '2d') {
  const app = mount({ coins: 100, xp });
  t.after(app.close);
  const { w, $ } = app;
  w.localStorage.setItem('pawtopia-jerry-display-mode', mode);
  w.eval(fs.readFileSync('world.js', 'utf8'));
  w.eval(fs.readFileSync('jerry-legacy-2d.js', 'utf8'));
  w.eval([...w.document.scripts].at(-1).textContent);
  const events = [];
  $('#scene').addEventListener('pawtopia-jerry-action', e => events.push(e.detail.action));
  return { ...app, events };
}

const controls = {
  food: 'Feed', ball: 'Play', sleep: 'Sleep', bath: 'Bath',
  home: 'House', portrait: 'Touch', dress: 'Dress'
};

for (const [stage, xp] of [['Baby', 0], ['Puppy', 100], ['Adult', 300]]) {
  test(stage + ' routes all 2D controls to the correct original files', async t => {
    const {w, $, click, events} = setup(t, xp);
    assert.equal($('.scene-actions [aria-label="Touch"]'), null);
    let downloaded;
    w.fetch = async path => {
      downloaded = path;
      return { ok: true, blob: async () => new w.Blob() };
    };
    w.URL.createObjectURL = () => 'blob:video';
    w.URL.revokeObjectURL = () => {};
    for (const [button, name] of Object.entries(controls)) {
      click('#' + button);
      const video = $('#jerryLegacyClip');
      assert.equal(video.parentElement, $('#jerryVideoLayer'));
      const downloadedDress = stage === 'Baby' && name === 'Dress';
      if (downloadedDress) {
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(video.getAttribute('src'), 'blob:video');
      }
      const src = downloadedDress ? downloaded : video.getAttribute('src');
      assert.match(src, new RegExp('^assets/videos/(?:silent/)?' + stage.toLowerCase() + '/Jerry_' + stage + '_' + name));
      assert(fs.existsSync(src));
      assert.equal(video.playsInline, true);
      assert.equal(video.muted, true);
      assert.equal($('#jerryVideoLayer').classList.contains('is-playing'), false);
      video.dispatchEvent(new w.Event('playing'));
      assert.equal($('#jerryVideoLayer').classList.contains('is-playing'), true);
      video.dispatchEvent(new w.Event('ended'));
      assert.equal($('#jerryLegacyClip'), null);
      assert.equal($('#worldOverlay').hidden, true);
      assert.equal($('#jerryVideoLayer').classList.contains('is-playing'), false);
    }
    assert.deepEqual(events, []);
  });
}

test('mode and room switches cancel playback; stale media events cannot award anything', t => {
  const { w, $, click, save, events } = setup(t, 90);
  const before = save();
  click('#food');
  const stale = $('#jerryLegacyClip');
  assert.equal($('#food').disabled, true);
  assert.equal(save().feedCount, before.feedCount);
  click('[data-jerry-mode="3d"]');
  click('#portrait');
  assert.deepEqual(events, ['touch']);
  click('[data-jerry-mode="2d"]');
  click('#food');
  const current = $('#jerryLegacyClip');
  stale.dispatchEvent(new w.Event('ended'));
  assert.equal($('#jerryLegacyClip'), current);
  assert.equal(save().xp, before.xp);
  current.dispatchEvent(new w.Event('ended'));
  current.dispatchEvent(new w.Event('error'));
  assert.equal(save().feedCount, before.feedCount + 1);
  assert.equal(save().xp, 100);
  assert.equal(save().growthStage, 'Puppy');
  click('#ball');
  w.pawtopiaWorld.commit('room', 'garden');
  assert.equal($('#jerryLegacyClip'), null);
  assert.equal(save().xp, 100);
  assert.equal(save().coins, before.coins);
  assert.equal(w.localStorage.getItem('pawtopia-jerry-display-mode'), '2d');
});

test('switching modes aborts the Dress download and discards a late response', async t => {
  const { w, $, click } = setup(t, 0);
  let resolveDownload;
  let signal;
  w.fetch = (path, options) => {
    signal = options.signal;
    return new Promise(resolve => { resolveDownload = resolve; });
  };
  w.URL.createObjectURL = () => assert.fail('Cancelled download should never start playing');
  click('#dress');
  assert($('#jerryLegacyClip'));
  click('[data-jerry-mode="3d"]');
  assert(signal.aborted);
  assert.equal($('#jerryLegacyClip'), null);
  resolveDownload({ ok: true, blob: async () => new w.Blob() });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal($('#jerryLegacyClip'), null);
  assert.equal($('#dress').disabled, false);
});


test('3D Dress opens the wardrobe, applies clothing and closes when leaving 3D', t => {
  const { w, $, click, events } = setup(t, 0, '3d');
  assert.equal($('.scene-actions [aria-label="Touch"]'), null);
  click('#dress');
  assert.equal($('#worldTitle').textContent, 'Dress Jerry');
  assert.equal($('#worldOverlay').hidden, false);
  assert.equal($('#jerryLegacyClip'), null);
  assert.deepEqual(events, ['dress']);
  click('[data-dress-item="baby-blue-shirt"]');
  assert.equal(w.pawtopiaWorld.snapshot().world.equipped.outfit, 'baby-blue-shirt');
  assert.deepEqual(events, ['dress', 'dress-show']);
  click('#dress');
  click('[data-jerry-mode="2d"]');
  assert.equal($('#worldOverlay').hidden, true);
  assert.equal($('#jerryLegacyClip'), null);
});
