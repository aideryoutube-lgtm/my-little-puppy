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

test('only 2D Bathroom shows the five icon controls and routes Puppy clips', async t => {
  const { w, $, click, events } = setup(t, 100);
  const panel = $('#bathroom2dActions');
  const original = $('.scene-actions');
  const originalMarkup = original.innerHTML;
  let downloaded;
  w.fetch = async path => {
    downloaded = path;
    return {ok: true, blob: async () => new w.Blob()};
  };
  w.URL.createObjectURL = () => 'blob:bathroom';
  w.URL.revokeObjectURL = () => {};
  assert(panel.hidden);
  assert(!original.hidden);

  click('[data-room="bathroom"]');
  assert(!panel.hidden);
  assert(original.hidden);
  const buttons = [...panel.querySelectorAll('button')];
  assert.deepEqual(buttons.map(button => button.getAttribute('aria-label')),
    ['Bath', 'Bubbles', 'Brush', 'Dry', 'Mirror']);
  assert.deepEqual(buttons.map(button => button.textContent), ['🛁', '🫧', '🪮', '💨', '🪞']);
  assert(buttons.every(button => button.firstElementChild.getAttribute('aria-hidden') === 'true'));

  for (const button of buttons) {
    const label = button.getAttribute('aria-label');
    button.click();
    const video = $('#jerryLegacyClip');
    const expected = label === 'Bath'
      ? 'assets/videos/puppy/Puppy_Bath_Bathroom_4s.mp4'
      : 'assets/videos/puppy/Jerry_Puppy_Bathroom_' + label + '.mp4';
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(downloaded, expected);
    assert.equal(video.getAttribute('src'), 'blob:bathroom');
    assert(fs.existsSync(expected));
    assert(buttons.every(button => button.disabled));
    buttons[4].click();
    assert.equal($('#jerryLegacyClip'), video);
    video.dispatchEvent(new w.Event('ended'));
    assert.equal($('#jerryLegacyClip'), null);
    assert.equal(w.pawtopiaWorld.snapshot().world.room, 'bathroom');
    assert(buttons.every(button => !button.disabled));
  }

  buttons[1].click();
  click('[data-jerry-mode="3d"]');
  assert.equal($('#jerryLegacyClip'), null);
  assert(panel.hidden);
  assert(!original.hidden);
  buttons[1].click();
  assert.equal($('#jerryLegacyClip'), null);
  assert.deepEqual(events, []);

  click('[data-jerry-mode="2d"]');
  buttons[2].click();
  click('[data-room="living"]');
  assert.equal($('#jerryLegacyClip'), null);
  assert(panel.hidden);
  assert(!original.hidden);
  assert.equal(original.innerHTML, originalMarkup);
  click('#bath');
  assert.equal($('#jerryLegacyClip').getAttribute('src'), 'assets/videos/silent/puppy/Jerry_Puppy_Bath.mp4');
});

for (const [stage, xp] of [['Baby', 0], ['Adult', 300]]) {
  test(stage + ' Bathroom keeps Bath and disables the four Puppy actions', t => {
    const { $, click } = setup(t, xp);
    click('[data-room="bathroom"]');
    const [bath, ...puppyActions] = $('#bathroom2dActions').children;
    assert(!bath.disabled);
    for (const button of puppyActions) {
      assert(button.disabled);
      button.click();
      assert.equal($('#jerryLegacyClip'), null);
    }
    bath.click();
    assert.match($('#jerryLegacyClip').getAttribute('src'),
      new RegExp('/' + stage.toLowerCase() + '/Jerry_' + stage + '_Bath\\.mp4$'));
  });
}

test('3D models follow the current stage and ignore a previous model’s load event', async t => {
  const { w, $, click } = setup(t, 299, '3d');
  const scene = $('#scene');
  scene.dataset.growthStage = 'Baby';
  w.eval(fs.readFileSync('jerry-3d.js', 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const setStage = async stage => {
    scene.dataset.growthStage = stage;
    await new Promise(resolve => setImmediate(resolve));
  };
  const ready = () => scene.classList.contains('jerry-3d-ready');

  assert.equal($('#jerry3D'), null);
  await setStage('Puppy');
  const puppy = $('#jerry3D');
  assert.match(puppy.getAttribute('src'), /^assets\/models\/Jerry_Puppy\.glb\?/);
  assert.equal(ready(), false);

  w.pawtopiaWorld.action('feed');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(scene.dataset.growthStage, 'Adult');
  const adult = $('#jerry3D');
  assert.equal(puppy.isConnected, false);
  assert.equal(adult.getAttribute('src'), 'assets/models/Jerry_Adult.glb');
  puppy.dispatchEvent(new w.Event('load'));
  assert.equal(ready(), false);

  adult.dispatchEvent(new w.Event('load'));
  assert.equal(ready(), true);
  adult.click();
  assert.equal($('#jerryActionStatus').textContent, 'No Adult 3D animation is available for touch.');
  for (const room of ['living', 'kitchen', 'bedroom', 'bathroom', 'garden']) {
    w.pawtopiaWorld.commit('room', room);
    assert.equal($('#jerry3D'), adult);
    assert.equal(ready(), true);
  }

  click('[data-jerry-mode="2d"]');
  assert.equal(adult.hidden, true);
  assert.equal(ready(), false);
  click('[data-jerry-mode="3d"]');
  assert.equal(adult.hidden, false);
  assert.equal(ready(), true);

  adult.dispatchEvent(new w.Event('error'));
  assert.equal(ready(), false);
  assert.equal($('#jerryActionStatus').textContent, 'The Adult 3D model could not load.');
  await setStage('Baby');
  assert.equal($('#jerry3D'), null);
  assert.equal(ready(), false);
});

for (const [button, action] of [['#sleep', 'Sleep'], ['#ball', 'Play']]) {
  test('Puppy Bedroom ' + action + ' plays once and returns to Bedroom', async t => {
    const { w, $, click, events } = setup(t, 100);
    const downloads = [];
    w.fetch = async path => {
      downloads.push(path);
      return { ok: true, blob: async () => new w.Blob() };
    };
    w.URL.createObjectURL = () => 'blob:bedroom';
    w.URL.revokeObjectURL = () => {};
    click('[data-room="bedroom"]');
    const visible = $('[data-puppy2d-room="bedroom"] [aria-label="' + action + '"]');
    assert(!visible.parentElement.hidden);
    visible.click();
    const video = $('#jerryLegacyClip');
    assert(visible.disabled);
    visible.click();
    await new Promise(resolve => setImmediate(resolve));
    const expected = 'assets/videos/puppy/Puppy_' + action + '_Bedroom_4s.mp4';
    assert.deepEqual(downloads, [expected]);
    assert(fs.existsSync(expected));
    assert.equal(video.getAttribute('src'), 'blob:bedroom');
    assert.equal(video.playsInline, true);
    assert.equal(video.muted, true);
    video.dispatchEvent(new w.Event('playing'));
    assert($('#jerryVideoLayer').classList.contains('is-playing'));
    video.dispatchEvent(new w.Event('ended'));
    assert.equal($('#jerryLegacyClip'), null);
    assert(!$('#jerryVideoLayer').classList.contains('is-playing'));
    assert.equal(w.pawtopiaWorld.snapshot().world.room, 'bedroom');
    assert.deepEqual(events, []);
    click('[data-jerry-mode="3d"]');
    click(button);
    assert.equal($('#jerryLegacyClip'), null);
    assert.deepEqual(events, [action.toLowerCase()]);
  });
}

test('Puppy 2D room controls use distinct video slots and preserve the shared controls', t => {
  const { w, $, click, save } = setup(t, 100);
  const original = $('.scene-actions');
  const markup = original.innerHTML;
  const slots = new Set();
  w.fetch = () => assert.fail('An unfilled video slot must not request a clip');
  const rooms = {
    bedroom: ['Sleep', 'Play', 'Dress', 'Jump', 'Cuddle'],
    kitchen: ['Feed', 'Drink', 'Treat', 'Cook', 'Snack'],
    garden: ['House', 'Run', 'Fetch', 'Dig', 'Explore']
  };
  for (const [room, labels] of Object.entries(rooms)) {
    click('[data-room="' + room + '"]');
    const panel = $('[data-puppy2d-room="' + room + '"]');
    const buttons = [...panel.children];
    assert(!panel.hidden);
    assert(original.hidden);
    assert($('#jerryActionStatus').hidden);
    assert.deepEqual(buttons.map(button => button.getAttribute('aria-label')), labels);
    const before = save();
    for (const button of room === 'bedroom' ? buttons.slice(2) : buttons) {
      assert.equal(button.id, 'puppy-' + room + '-' + button.getAttribute('aria-label').toLowerCase());
      slots.add(button.id);
      button.click();
      assert.equal($('#jerryLegacyClip'), null);
      assert.equal($('#jerryActionStatus').textContent, 'Coming soon');
      assert(!$('#jerryActionStatus').hidden);
      assert.deepEqual(save(), before);
    }
    click('[data-jerry-mode="3d"]');
    assert(panel.hidden);
    assert(!original.hidden);
    assert.equal(original.innerHTML, markup);
    assert($('#jerryActionStatus').hidden);
    click('[data-jerry-mode="2d"]');
    assert(!panel.hidden);
  }
  assert.equal(slots.size, 13);
  click('[data-room="living"]');
  assert(!original.hidden);
  assert.equal(original.innerHTML, markup);
});

for (const [stage, xp] of [['Baby', 0], ['Adult', 300]]) {
  test(stage + ' keeps the standard controls in Bedroom, Kitchen and Garden', t => {
    const { $, click } = setup(t, xp);
    for (const room of ['bedroom', 'kitchen', 'garden']) {
      click('[data-room="' + room + '"]');
      assert(!$('.scene-actions').hidden);
      assert($('[data-puppy2d-room="' + room + '"]').hidden);
    }
  });
}
