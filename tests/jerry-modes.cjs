const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mount } = require('./support/mini-harness.cjs');

function setup(t, xp, mode = '2d') {
  const app = mount({ coins: 100, xp });
  t.after(app.close);
  const { w, $ } = app;
  w.localStorage.setItem('pawtopia-jerry-display-mode', mode);
  w.eval(fs.readFileSync('jerry-legacy-2d.js', 'utf8'));
  w.eval([...w.document.scripts].at(-1).textContent);
  const events = [];
  $('#scene').addEventListener('pawtopia-jerry-action', e => events.push(e.detail.action));
  return { ...app, events };
}

const controls = {
  food: 'Feed', ball: 'Play', sleep: 'Sleep', bath: 'Bath',
  home: 'House', touchJerry: 'Touch', dress: 'Dress'
};

for (const [stage, xp] of [['Baby', 0], ['Puppy', 100], ['Adult', 300]]) {
  test(stage + ' routes all 2D controls to the correct original files', async t => {
    const {w, $, click, events} = setup(t, xp);
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
      assert.equal($('#scene').classList.contains('jerry-video-playing'), false);
      video.dispatchEvent(new w.Event('playing'));
      assert.equal($('#scene').classList.contains('jerry-video-playing'), true);
      video.dispatchEvent(new w.Event('ended'));
      assert.equal($('#jerryLegacyClip'), null);
      assert.equal($('#scene').classList.contains('jerry-video-playing'), false);
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
  click('#touchJerry');
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
