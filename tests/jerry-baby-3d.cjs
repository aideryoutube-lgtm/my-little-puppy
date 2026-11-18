const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'jerry-baby-3d.js');
const run = fs.readFileSync(modulePath, 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

test('Baby GLB is self-contained with indexed geometry and three embedded textures', () => {
  const file = fs.readFileSync(path.join(root, 'assets/models/Jerry_Baby.glb'));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const jsonEnd = 20 + file.readUInt32LE(12);
  const gltf = JSON.parse(file.toString('utf8', 20, jsonEnd));
  assert.equal(gltf.buffers.length, 1);
  assert.equal(gltf.buffers[0].uri, undefined);
  assert.equal(gltf.buffers[0].byteLength, file.readUInt32LE(jsonEnd));
  assert.equal(gltf.meshes.length, 1);
  const mesh = gltf.meshes[0].primitives[0];
  assert.equal(gltf.accessors[mesh.indices].count, 92937);
  assert.equal(gltf.images.length, 3);
  for (const image of gltf.images) {
    const view = gltf.bufferViews[image.bufferView];
    assert(view.byteLength > 0 && view.byteOffset + view.byteLength <= gltf.buffers[0].byteLength);
    assert.match(image.mimeType, /^image\/(png|jpeg)$/);
  }
  assert.equal(gltf.skins, undefined);
  assert.equal(gltf.animations, undefined);
});

test('3D Baby follows room changes and keeps the still on renderer failure', async t => {
  const { window } = new JSDOM(
    '<section id="roomCanvas" class="room-living"><div id="scene" data-growth-stage="Puppy"></div></section>',
    { runScripts: 'outside-only' },
  );
  t.after(() => window.close());
  const doc = window.document;
  const room = doc.getElementById('roomCanvas');
  const scene = doc.getElementById('scene');
  const shown = () => scene.classList.contains('jerry-baby-3d-ready');
  window.HTMLElement.prototype.dismissPoster = () => {};
  window.eval(run);
  assert.equal(doc.getElementById('jerryBaby3D'), null);

  scene.dataset.growthStage = 'Baby';
  await settle();
  const viewer = doc.getElementById('jerryBaby3D');
  assert(viewer);
  assert.equal(shown(), false);
  viewer.dispatchEvent(new window.Event('load'));
  assert(shown());
  for (const name of ['living', 'kitchen', 'bedroom', 'bathroom', 'garden']) {
    room.className = 'room-' + name;
    await settle();
    assert.equal(room.querySelector('#jerryBaby3D'), viewer);
    assert(shown());
  }
  scene.dataset.growthStage = 'Adult';
  await settle();
  assert(viewer.hidden && !shown());
  scene.dataset.growthStage = 'Baby';
  await settle();
  assert(shown());
  room.classList.add('jerry-3d-ready');
  await settle();
  assert(viewer.hidden && !shown());
  room.classList.remove('jerry-3d-ready');
  await settle();
  assert(shown());
  viewer.dispatchEvent(new window.Event('error'));
  assert.equal(doc.getElementById('jerryBaby3D'), null);
  assert.equal(shown(), false);
});

test('Animated Baby has a weighted skin, blink morph and all care clips', () => {
  const file = fs.readFileSync(path.join(root, 'assets/models/Jerry_Baby_Animated.glb'));
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  assert.equal(file.readUInt32LE(8), file.length);
  assert.equal(gltf.skins[0].joints.length, 15);
  const mesh = gltf.meshes[0].primitives[0];
  for (const key of ['JOINTS_0', 'WEIGHTS_0']) {
    assert.equal(gltf.accessors[mesh.attributes[key]].count,
      gltf.accessors[mesh.attributes.POSITION].count);
  }
  assert.equal(mesh.targets.length, 1);
  assert.deepEqual(gltf.animations.map(clip => clip.name), [
    'Idle', 'Walk', 'Happy', 'WalkToBowl', 'Eat', 'WalkHome',
    'WalkToBed', 'LieDown', 'Sleep', 'WakeUp', 'SleepWalkHome',
    'WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome',
    'WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome', 'DressTurn',
    'WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome',
    'WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome',
  ]);
  assert(gltf.animations[1].channels.some(channel =>
    channel.target.node === gltf.skins[0].skeleton && channel.target.path === 'translation'));
});

test('Touch interrupts Walk once and Happy ends in Idle', async t => {
  const { window } = new JSDOM(
    '<div id="roomCanvas" class="room-living"><div id="scene" data-growth-stage="Baby"></div></div>' +
    '<div id="worldOverlay" hidden></div><div id="miniOverlay" hidden></div>',
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  t.after(() => window.close());
  const played = [];
  let stroll;
  window.setTimeout = callback => { stroll = callback; return 1; };
  window.clearTimeout = () => {};
  Object.assign(window.HTMLElement.prototype, {
    availableAnimations: ['Idle', 'Walk', 'Happy'],
    play(options) { played.push([this.animationName, options.repetitions]); },
    dismissPoster() {},
    pause() {},
  });
  window.eval(run);
  const viewer = window.document.getElementById('jerryBaby3D');
  const scene = window.document.getElementById('scene');
  viewer.dispatchEvent(new window.Event('load'));
  await settle();
  stroll();
  await settle();
  for (let tap = 0; tap < 2; tap++) {
    scene.dispatchEvent(new window.CustomEvent('pawtopia-jerry-action', { detail: { action: 'touch' } }));
  }
  await settle();
  viewer.dispatchEvent(new window.Event('finished'));
  await settle();
  assert.deepEqual(played, [['Idle', undefined], ['Walk', 1], ['Happy', 1], ['Idle', undefined]]);
});

test('Care clips share the skeleton and preserve the root and prop positions at transitions', () => {
  const file = fs.readFileSync(path.join(root, 'assets/models/Jerry_Baby_Animated.glb'));
  const length = file.readUInt32LE(12);
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + length));
  const ground = gltf.skins[0].skeleton;
  const named = Object.fromEntries(gltf.nodes.map((node, i) => [node.name, i]));
  const clips = Object.fromEntries(gltf.animations.map(clip => [clip.name, clip]));
  function samples(clip, node, channelPath) {
    const animation = clips[clip];
    const channel = animation.channels.find(c => c.target.node === node && c.target.path === channelPath);
    assert(channel, clip + ' must animate ' + gltf.nodes[node].name + ' ' + channelPath);
    const accessor = gltf.accessors[animation.samplers[channel.sampler].output];
    const view = gltf.bufferViews[accessor.bufferView];
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
    const start = 28 + length + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    return Array.from({length: accessor.count}, (_, frame) =>
      Array.from({length: width}, (_, axis) => file.readFloatLE(start + (frame * width + axis) * 4)));
  }
  const approach = samples('WalkToBowl', ground, 'translation');
  const eat = samples('Eat', ground, 'translation');
  const back = samples('WalkHome', ground, 'translation');
  assert.notDeepEqual(approach[0], approach.at(-1));
  assert.deepEqual(approach.at(-1), eat[0]);
  assert.deepEqual(eat.at(-1), back[0]);
  assert.deepEqual(back.at(-1), approach[0]);
  for (const name of ['Neck', 'Head', 'Tail']) {
    const keys = samples('Eat', named[name], 'rotation');
    assert(keys.some(key => key.some((component, axis) => component !== keys[0][axis])));
  }
  assert(samples('Eat', named.Tongue, 'scale').some(key => key[0] > 0));
  assert(!gltf.skins[0].joints.includes(named.Tongue));
  for (const name of Object.keys(named).filter(name => name.endsWith('paw'))) {
    for (const walk of ['WalkToBowl', 'WalkHome']) {
      const keys = samples(walk, named[name], 'translation');
      const heights = keys.map(key => key[1]);
      assert(Math.max(...heights) - Math.min(...heights) > .05);
    }
  }
  for (const sequence of [
    ['Idle', 'WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome', 'Idle'],
    ['Idle', 'WalkToBed', 'LieDown', 'Sleep', 'WakeUp', 'SleepWalkHome', 'Idle'],
    ['Idle', 'WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome', 'Idle'],
    ['Idle', 'WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome', 'Idle'],
    ['Idle', 'WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome', 'Idle'],
  ]) {
    const positions = sequence.map(name => samples(name, ground, 'translation'));
    for (let i = 1; i < positions.length; i++) {
      assert.deepEqual(positions[i - 1].at(-1), positions[i][0]);
    }
  }
  assert.notDeepEqual(samples('WalkToWater', ground, 'translation').at(-1), approach.at(-1));
  for (const [animation, node, property] of [
    ['RestInside', 'Torso', 'translation'],
    ['Stretch', 'Neck', 'rotation'],
    ['DrinkWater', 'Head', 'rotation'],
    ['DrinkWater', 'Tongue', 'scale'],
    ['DrinkWater', 'Water ripple 1', 'scale'],
    ['LickLips', 'Head', 'rotation'],
  ]) {
    const keys = samples(animation, named[node], property);
    assert(keys.some(key => key.some((value, axis) => value !== keys[0][axis])));
  }
  for (const name of ['Open doghouse', 'Doghouse pitched roof']) {
    const node = named[name];
    assert(gltf.scenes[0].nodes.includes(node));
    const walls = samples('EnterHouse', node, 'translation');
    assert(walls.every(key => key.every((value, axis) => value === walls[0][axis])));
  }
  assert(samples('Sleep', 0, 'weights').every(([weight]) => weight === 1));
  const breath = samples('Sleep', named.Torso, 'translation');
  assert(breath.some(([, height]) => height > breath[0][1]));
  assert.deepEqual(samples('WakeUp', 0, 'weights').at(-1), [0]);

  for (const name of ['Bath water', 'Bath foam', 'Bath droplet 1']) {
    assert.deepEqual(gltf.nodes[named[name]].scale, [0, 0, 0]);
    assert(samples('BathWash', named[name], 'scale').some(([scale]) => scale > 0));
    assert.deepEqual(samples('BathShake', named[name], 'scale').at(-1), [0, 0, 0]);
  }
  assert(samples('BathWash', 0, 'weights').some(([weight]) => weight > .7));
  const spin = samples('DressTurn', ground, 'rotation');
  assert(spin.some(([, turn]) => turn > .99));
  for (const [name, bone] of [['Blue T-shirt', 'Torso'], ['Yellow Raincoat', 'Torso'], ['Red Cap', 'Head']]) {
    assert(gltf.nodes[named[bone]].children.includes(named[name]));
    const primitive = gltf.meshes[gltf.nodes[named[name]].mesh].primitives[0];
    const material = gltf.materials[primitive.material];
    assert.equal(material.alphaMode, 'MASK');
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3], 0);
  }

  const ball = named['Beach ball'];
  assert(!gltf.skins[0].joints.includes(ball));
  assert(gltf.scenes[0].nodes.includes(ball));
  assert.deepEqual(gltf.nodes[ball].scale, [0, 0, 0]);
  const rolls = ['WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome']
    .map(name => samples(name, ball, 'translation'));
  for (let i = 1; i < rolls.length; i++) assert.deepEqual(rolls[i - 1].at(-1), rolls[i][0]);
  assert.notDeepEqual(rolls[1][0], rolls[1].at(-1));
  assert.notDeepEqual(rolls[2][0], rolls[2].at(-1));
  assert.deepEqual(samples('PlayWalkHome', ball, 'scale').at(-1), [0, 0, 0]);
});

test('Feed goes to the kitchen, blends through Eat, returns home and cancels on manual room change', async t => {
  const { window } = new JSDOM(
    '<div id="roomCanvas" class="room-garden"><div id="scene" data-growth-stage="Baby"></div></div>',
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  t.after(() => window.close());
  const doc = window.document;
  const canvas = doc.getElementById('roomCanvas');
  const scene = doc.getElementById('scene');
  const visits = [];
  const played = [];
  const frames = [];
  window.requestAnimationFrame = callback => frames.push(callback);
  window.pawtopiaWorld = { commit(type, value) {
    assert.equal(type, 'room');
    visits.push(value);
    canvas.className = 'room-' + value;
    return { ok: true };
  }};
  Object.assign(window.HTMLElement.prototype, {
    availableAnimations: ['Idle', 'Walk', 'Happy', 'WalkToBowl', 'Eat', 'WalkHome'],
    duration: 4,
    dismissPoster() {},
    play(options) { played.push([this.animationName, options.repetitions]); },
    pause() {},
  });
  window.eval(run);
  const viewer = doc.getElementById('jerryBaby3D');
  const feed = () => scene.dispatchEvent(new window.CustomEvent('pawtopia-jerry-action', {
    detail: { action: 'feed' },
  }));
  viewer.dispatchEvent(new window.Event('load'));
  await settle();
  feed();
  await settle();
  assert.equal(viewer.animationName, 'WalkToBowl');
  feed();
  for (const next of ['Eat', 'WalkHome', 'Idle']) {
    viewer.currentTime = 3.7;
    frames.shift()();
    await settle();
    assert.equal(viewer.animationName, next);
  }
  assert.deepEqual(played, ['Idle', 'WalkToBowl', 'Eat', 'WalkHome', 'Idle'].map(name => [name, undefined]));
  assert.deepEqual(visits, ['kitchen', 'garden']);
  assert.equal(doc.querySelectorAll('#jerryBaby3D').length, 1);
  feed();
  await settle();
  canvas.className = 'room-bedroom';
  await settle();
  frames.shift()();
  assert.equal(viewer.animationName, 'Idle');
  assert.deepEqual(visits, ['kitchen', 'garden', 'kitchen']);
});


for (const [action, room, clips] of [
  ['care', 'bathroom', ['WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome']],
  ['sleep', 'bedroom', ['WalkToBed', 'LieDown', 'Sleep', 'WakeUp', 'SleepWalkHome']],
  ['play', 'garden', ['WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome']],
]) {
  test(action + ' visits the correct room and completes before restoring the original room', async t => {
    const { window } = new JSDOM(
      '<div id="roomCanvas" class="room-living"><div id="scene" data-growth-stage="Baby"><button id="bath"></button></div></div>',
      { runScripts: 'outside-only', pretendToBeVisual: true },
    );
    t.after(() => window.close());
    const canvas = window.document.getElementById('roomCanvas');
    const scene = window.document.getElementById('scene');
    const frames = [];
    window.requestAnimationFrame = callback => frames.push(callback);
    window.pawtopiaWorld = { commit(type, value) {
      assert.equal(type, 'room');
      canvas.className = 'room-' + value;
      return { ok: true };
    }};
    Object.assign(window.HTMLElement.prototype, {
      availableAnimations: ['Idle', ...clips],
      duration: 4,
      dismissPoster() {},
      play() {},
      pause() {},
    });
    window.eval(run);
    const viewer = window.document.getElementById('jerryBaby3D');
    const fur = {
      baseColorFactor: [1, 1, 1, 1],
      roughnessFactor: 1,
      setBaseColorFactor(color) { this.baseColorFactor = color; },
      setRoughnessFactor(roughness) { this.roughnessFactor = roughness; },
    };
    viewer.model = { materials: [{ name: 'BakedMaterial', pbrMetallicRoughness: fur }] };
    const bathButton = window.document.getElementById('bath');
    viewer.dispatchEvent(new window.Event('load'));
    await settle();
    scene.dispatchEvent(new window.CustomEvent('pawtopia-jerry-action', { detail: { action } }));
    await settle();
    for (const clip of clips) {
      assert.equal(canvas.className, 'room-' + room);
      assert.equal(viewer.animationName, clip);
      assert(bathButton.disabled);
      if (clip === 'BathWash') {
        viewer.currentTime = .8;
        frames.shift()();
        assert(fur.baseColorFactor[0] < 1 && fur.roughnessFactor < 1);
        scene.dispatchEvent(new window.CustomEvent('pawtopia-jerry-action', { detail: { action: 'touch' } }));
        assert.equal(viewer.animationName, clip);
      }
      viewer.currentTime = 3.7;
      frames.shift()();
      await settle();
    }
    assert.equal(canvas.className, 'room-living');
    assert.equal(viewer.animationName, 'Idle');
    assert.equal(bathButton.disabled, false);
    assert.equal(fur.baseColorFactor[0], 1);
    assert.equal(fur.roughnessFactor, 1);
  });
}


test('Dress equips starter clothes without spending coins and reloads both wardrobe slots', () => {
  const { mount } = require('./support/mini-harness.cjs');
  const app = mount({ coins: 45, xp: 0, world: { room: 'living' } });
  try {
    app.w.eval(fs.readFileSync(path.join(root, 'world.js'), 'utf8'));
    const actions = [];
    app.$('#scene').addEventListener('pawtopia-jerry-action', event => actions.push(event.detail.action));
    for (const id of ['baby-blue-shirt', 'baby-red-cap', 'baby-yellow-coat']) {
      app.click('#dress');
      app.click(`[data-dress-item="${id}"]`);
      assert(app.$('#worldOverlay').hidden);
    }
    assert.deepEqual(actions, ['dress', 'dress-show', 'dress', 'dress-show', 'dress', 'dress-show']);
    for (const room of ['kitchen', 'bedroom', 'bathroom', 'garden', 'living']) {
      assert(app.w.pawtopiaWorld.commit('room', room).ok);
      assert.deepEqual(app.save().world.equipped, { outfit: 'baby-yellow-coat', hat: 'baby-red-cap' });
    }
    const restored = mount(app.save());
    try {
      restored.w.eval(fs.readFileSync(path.join(root, 'world.js'), 'utf8'));
      assert.equal(restored.save().coins, 45);
      assert.deepEqual(restored.save().world.equipped, { outfit: 'baby-yellow-coat', hat: 'baby-red-cap' });
      restored.click('#dress');
      restored.click('[data-dress-item="baby-red-cap"]');
      assert.deepEqual(restored.save().world.equipped, { outfit: 'baby-yellow-coat' });
    } finally {
      restored.close();
    }
  } finally {
    app.close();
  }
});


test('House requires ownership and Drink starts only in the kitchen; both lock care until Idle', async t => {
  const { window } = new JSDOM(
    '<div id="roomCanvas" class="room-kitchen"><div id="scene" data-growth-stage="Baby">' +
    '<button id="home"></button><button id="food"></button></div></div>',
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  t.after(() => window.close());
  const doc = window.document;
  const canvas = doc.getElementById('roomCanvas');
  const scene = doc.getElementById('scene');
  const home = doc.getElementById('home');
  const frames = [];
  const house = ['WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome'];
  const drink = ['WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome'];
  let hasHome = false;
  window.requestAnimationFrame = callback => frames.push(callback);
  window.pawtopiaWorld = {
    snapshot: () => ({ hasHome }),
    commit(type, room) {
      assert.equal(type, 'room');
      canvas.className = 'room-' + room;
      return { ok: true };
    },
  };
  Object.assign(window.HTMLElement.prototype, {
    availableAnimations: ['Idle', ...house, ...drink],
    duration: 4,
    dismissPoster() {},
    play() {},
    pause() {},
  });
  window.eval(run);
  const viewer = doc.getElementById('jerryBaby3D');
  const act = action => scene.dispatchEvent(new window.CustomEvent('pawtopia-jerry-action', {
    detail: { action },
  }));
  viewer.dispatchEvent(new window.Event('load'));
  await settle();
  act('house');
  assert.equal(viewer.animationName, 'Idle');
  canvas.className = 'room-living';
  await settle();
  act('drink');
  assert.equal(viewer.animationName, 'Idle');

  hasHome = true;
  for (const [action, room, origin, sequence] of [
    ['house', 'garden', 'living', house],
    ['drink', 'kitchen', 'kitchen', drink],
  ]) {
    canvas.className = 'room-' + origin;
    await settle();
    act(action);
    await settle();
    assert.equal(canvas.className, 'room-' + room);
    for (const clip of sequence) {
      assert.equal(viewer.animationName, clip);
      assert(home.disabled && scene.hasAttribute('data-care-busy'));
      for (const blocked of ['house', 'drink', 'feed', 'sleep', 'play', 'care', 'dress-show', 'touch']) {
        act(blocked);
      }
      assert.equal(viewer.animationName, clip);
      viewer.currentTime = 3.7;
      frames.shift()();
      await settle();
    }
    assert.equal(viewer.animationName, 'Idle');
    assert.equal(canvas.className, 'room-' + origin);
    assert(!home.disabled && !scene.hasAttribute('data-care-busy'));
  }
});

test('House and kitchen Drink controls dispatch care and block repeat water rewards', () => {
  const { mount } = require('./support/mini-harness.cjs');
  const app = mount({ hunger: 50, xp: 0, world: { room: 'kitchen' } });
  try {
    app.w.eval(fs.readFileSync(path.join(root, 'world.js'), 'utf8'));
    const scene = app.$('#scene');
    const actions = [];
    scene.classList.add('jerry-baby-3d-ready');
    scene.addEventListener('pawtopia-jerry-action', event => {
      actions.push(event.detail.action);
      if (event.detail.action === 'drink') scene.setAttribute('data-care-busy', '');
    });
    app.click('#home');
    assert.equal(app.save().hasHome, true);
    assert(app.w.pawtopiaWorld.commit("room", "kitchen").ok);
    const beforeDrink = app.save().hunger;
    app.click('[data-kitchen-water]');
    app.click('[data-bowl-water]');
    app.click('[data-bowl-food]');
    assert.equal(app.save().hunger, beforeDrink + 5);
    assert.deepEqual(actions, ['house', 'drink']);
  } finally {
    app.close();
  }
});
