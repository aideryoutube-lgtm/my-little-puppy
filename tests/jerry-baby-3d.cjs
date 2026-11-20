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
  window.HTMLElement.prototype.pause = () => {};
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

test('Animated Baby has a weighted skin, blink and chew morphs and all care clips', () => {
  const file = fs.readFileSync(path.join(root, 'assets/models/Jerry_Baby_Animated.glb'));
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  assert.equal(file.readUInt32LE(8), file.length);
  assert.equal(gltf.skins[0].joints.length, 15);
  const mesh = gltf.meshes[0].primitives[0];
  for (const key of ['JOINTS_0', 'WEIGHTS_0']) {
    assert.equal(gltf.accessors[mesh.attributes[key]].count,
      gltf.accessors[mesh.attributes.POSITION].count);
  }
  assert.deepEqual(gltf.meshes[0].extras.targetNames, ['Blink', 'Chew', 'FeedingRuff']);
  assert.deepEqual(gltf.animations.map(clip => clip.name), [
    'Idle', 'Walk', 'Happy', 'WalkToBowl', 'Eat', 'WalkHome',
    'ApproachBed', 'Crouch', 'JumpUp', 'LandOnMattress', 'SettleOnMattress', 'LieDown', 'Sleep', 'WakeUp', 'WalkToBedEdge', 'JumpDown', 'SleepWalkHome',
    'WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome',
    'WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome', 'DressTurn',
    'WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome',
    'WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome',
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap(count => ['WalkToHouse' + count, 'HouseWalkHome' + count]),
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
    play(options) {
      this.duration = feedClipDurations[this.animationName] ?? 4;
      played.push([this.animationName, options.repetitions]);
    },
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
    const width = channelPath === 'weights' ? gltf.meshes[0].weights.length : { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
    const start = 28 + length + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    return Array.from({length: channelPath === 'weights' ? accessor.count / width : accessor.count}, (_, frame) =>
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
  const tailDuringMeal = samples('Eat', named.Tail, 'rotation');
  const approachTail = samples('WalkToBowl', named.Tail, 'rotation').at(-1);
  assert(tailDuringMeal[0].every((value, axis) => value === approachTail[axis]));
  assert(tailDuringMeal.some(([pitch]) => pitch < -.25));
  const returnTail = samples('WalkHome', named.Tail, 'rotation')[0];
  assert(tailDuringMeal.at(-1).every((value, axis) => value === returnTail[axis]));
  assert(samples('Eat', 0, 'weights').some(([, chew]) => chew > .75));
  assert(samples('Idle', 0, 'weights').every(([, chew]) => chew === 0));
  for (const name of Object.keys(clips)) {
    const ruff = samples(name, 0, 'weights').map(weights => weights[2]);
    assert.equal(ruff[0], 0);
    assert.equal(ruff.at(-1), 0);
    assert.equal(Math.max(...ruff), name === 'Eat' ? 1 : 0);
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
    ['Idle', 'ApproachBed', 'Crouch', 'JumpUp', 'LandOnMattress', 'SettleOnMattress', 'LieDown', 'Sleep', 'WakeUp', 'WalkToBedEdge', 'JumpDown', 'SleepWalkHome', 'Idle'],
    ['Idle', 'WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome', 'Idle'],
    ['Idle', 'WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome', 'Idle'],
    ['Idle', 'WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome', 'Idle'],
  ]) {
    const positions = sequence.map(name => samples(name, ground, 'translation'));
    for (let i = 1; i < positions.length; i++) {
      assert.deepEqual(positions[i - 1].at(-1), positions[i][0]);
    }
  }
  const front = named['Front Left paw'];
  const hind = named['Hind Left paw'];
  const pawHeight = (clip, side, end) => {
    const limb = name => samples(clip, named[name], 'translation').at(end)[1];
    return limb('Torso') + limb(side + ' Left upper leg') + limb(side + ' Left paw');
  };
  assert(pawHeight('JumpUp', 'Front', -1) - pawHeight('JumpUp', 'Hind', -1) < -.2);
  assert(Math.abs(pawHeight('LandOnMattress', 'Front', -1) -
    pawHeight('LandOnMattress', 'Hind', -1)) < .0001);
  for (const paw of [front, hind]) {
    const steps = samples('ApproachBed', paw, 'translation').map(([, height]) => height);
    assert(Math.max(...steps) - Math.min(...steps) > .05);
  }
  assert(samples('Sleep', 0, 'weights').every(([blink, chew]) => blink === 1 && chew === 0));
  assert.equal(samples('WakeUp', 0, 'weights').at(-1)[0], 0);
  const lying = samples('LieDown', named.Torso, 'translation');
  assert(lying[0][1] - lying.at(-1)[1] > .4);
  for (const joint of ['Torso', 'Left ear', 'Right ear', 'Tail']) {
    const rhythm = samples('Sleep', named[joint], joint === 'Torso' ? 'translation' : 'rotation');
    assert(rhythm.some(frame => frame.some((axis, i) => Math.abs(axis - rhythm[0][i]) > .004)));
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
    assert.equal(named[name], undefined);
  }
  for (const node of Object.keys(named).filter(name => name.endsWith('paw'))) {
    for (const walk of ['WalkToHouse', 'EnterHouse', 'ExitHouse', 'HouseWalkHome']) {
      const heights = samples(walk, named[node], 'translation').map(([, height]) => height);
      assert(Math.max(...heights) - Math.min(...heights) > .035);
    }
  }
  assert(samples('Sleep', 0, 'weights').every(([weight]) => weight === 1));
  const breath = samples('Sleep', named.Torso, 'translation');
  assert(breath.some(([, height]) => height > breath[0][1]));
  assert.deepEqual(samples('WakeUp', 0, 'weights').at(-1), [0, 0, 0]);

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

const feedClipDurations = { WalkToBowl: 3.93, Eat: 5.71, WalkHome: 4.41 };

function loadFoodBowl(window) {
  const foodBowl = window.document.getElementById('babyFoodBowl');
  const materials = Array.from({ length: 8 }, (_, index) => ({
    name: 'Kibble ' + (index + 1),
    pbrMetallicRoughness: {
      baseColorFactor: [.3, .1, .03, 1],
      setBaseColorFactor(color) { this.baseColorFactor = color; }
    }
  }));
  foodBowl.model = { materials };
  foodBowl.dispatchEvent(new window.Event('load'));
  return materials;
}

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
    play(options) {
      this.duration = feedClipDurations[this.animationName] ?? 4;
      played.push([this.animationName, options.repetitions]);
    },
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
  assert.equal(viewer.animationName, 'Idle');
  loadFoodBowl(window);
  await settle();
  assert.equal(viewer.animationName, 'WalkToBowl');
  feed();
  for (const next of ['Eat', 'WalkHome', 'Idle']) {
    viewer.currentTime = viewer.duration;
    frames.shift()();
    await settle();
    assert.equal(viewer.animationName, next);
  }
  assert.deepEqual(played, [['Idle', undefined], ['WalkToBowl', 1], ['Eat', 1], ['WalkHome', 1], ['Idle', undefined]]);
  assert.deepEqual(visits, ['kitchen']);
  assert.equal(doc.querySelectorAll('#jerryBaby3D').length, 1);
  feed();
  await settle();
  canvas.className = 'room-bedroom';
  await settle();
  frames.shift()();
  assert.equal(viewer.animationName, 'Idle');
  assert.deepEqual(visits, ['kitchen']);
});


for (const [action, room, clips] of [
  ['care', 'bathroom', ['WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome']],
  ['sleep', 'bedroom', ['ApproachBed', 'Crouch', 'JumpUp', 'LandOnMattress', 'SettleOnMattress', 'LieDown', 'Sleep', 'WakeUp', 'WalkToBedEdge', 'JumpDown', 'SleepWalkHome']],
  ['play', 'garden', ['WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome']],
]) {
  test(action + ' completes its route in the correct room', async t => {
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
      if (action === 'sleep') {
        viewer.currentTime = clip === 'Sleep' ? 1 : viewer.duration - .05;
        frames.shift()(1000);
        assert.equal(viewer.animationName, clip);
        assert.equal(scene.classList.contains('baby-dreaming'), clip === 'Sleep');
        if (clip === 'Sleep') {
          assert(scene.classList.contains('baby-on-mattress'));
          assert.equal(scene.style.getPropertyValue('--sleep-y'), '31.7%');
        }
        if (clip === 'JumpUp') {
          viewer.currentTime = viewer.duration / 2;
          frames.shift()(1100);
          assert(parseFloat(scene.style.getPropertyValue('--sleep-y')) < 31.7);
          assert(!scene.classList.contains('baby-on-mattress'));
        }
        // A refresh and a paused frame preserve position and phase.
        scene.classList.add('progress-saved');
        await settle();
        viewer.paused = true;
        frames.shift()(9000);
        viewer.paused = false;
        assert.equal(viewer.animationName, clip);
      }
      if (clip === 'BathWash') {
        viewer.currentTime = .8;
        frames.shift()();
        assert(fur.baseColorFactor[0] < 1 && fur.roughnessFactor < 1);
        scene.dispatchEvent(new window.CustomEvent('pawtopia-jerry-action', { detail: { action: 'touch' } }));
        assert.equal(viewer.animationName, clip);
      }
      viewer.currentTime = action === 'sleep' ? viewer.duration : 3.7;
      frames.shift()();
      await settle();
    }
    assert.equal(canvas.className, action === 'sleep' ? 'room-bedroom' : 'room-living');
    assert.equal(viewer.animationName, 'Idle');
    assert.equal(bathButton.disabled, false);
    assert(!scene.classList.contains('baby-dreaming'));
    if (action === 'sleep') {
      scene.dispatchEvent(new window.CustomEvent('pawtopia-jerry-action', { detail: { action } }));
      await settle();
      for (const clip of clips) {
        assert.equal(viewer.animationName, clip);
        viewer.currentTime = viewer.duration;
        frames.shift()();
        await settle();
      }
      assert.equal(viewer.animationName, 'Idle');
      assert(!scene.classList.contains('baby-bed-route'));
      assert.equal(scene.style.getPropertyValue('--sleep-y'), '');
    }
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
  const house = ['WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'HouseWalkHome'];
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
  scene.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 533 });
  const gardenX = 300 * 700 / 941;
  viewer.getBoundingClientRect = () => ({ left: gardenX - 45, width: 90, top: 191.52, height: 100 });
  for (const [action, room, origin, sequence] of [
    ['house', 'garden', 'garden', house],
    ['house', 'garden', 'garden', house],
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
      if (action === 'house') {
        assert(scene.classList.contains('baby-house-route'));
        if (clip === 'WalkToHouse' || clip === 'HouseWalkHome') {
          const startX = parseFloat(scene.style.getPropertyValue('--house-x'));
          if (clip === 'WalkToHouse') assert.equal(startX, gardenX / 300 * 100);
          viewer.currentTime = .15;
          frames.shift()(150);
          assert.equal(parseFloat(scene.style.getPropertyValue('--house-x')), startX);
          viewer.currentTime = .50;
          frames.shift()(500);
          const currentX = parseFloat(scene.style.getPropertyValue('--house-x'));
          assert(clip === 'WalkToHouse' ? currentX > startX : currentX < startX);
        }
        if (clip === 'EnterHouse' || clip === 'ExitHouse') {
          viewer.currentTime = 1;
          frames.shift()(1000);
          assert(scene.classList.contains('baby-house-occluded'));
        }
        if (clip === 'RestInside') {
          assert(scene.classList.contains('baby-house-occluded'));
          assert.equal(parseFloat(scene.style.getPropertyValue('--house-y')), 594 / 1672 * 100);
        }
      }
      viewer.currentTime = action === 'house' ? viewer.duration : 3.7;
      frames.shift()();
      await settle();
    }
    assert.equal(viewer.animationName, 'Idle');
    assert.equal(canvas.className, 'room-' + origin);
    assert(!scene.classList.contains('baby-house-route'));
    assert(!scene.classList.contains('baby-house-occluded'));
    assert(!home.disabled && !scene.hasAttribute('data-care-busy'));
  }
  canvas.className = 'room-garden';
  await settle();
  act('house');
  await settle();
  assert.equal(viewer.animationName, 'WalkToHouse');
  canvas.className = 'room-bedroom';
  await settle();
  assert.equal(viewer.animationName, 'Idle');
  assert(!scene.classList.contains('baby-house-route'));
  assert(!scene.hasAttribute('data-care-busy'));
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

test('Saving care progress cannot cancel the 3D action through an unchanged effects preference', async t => {
  const { mount } = require('./support/mini-harness.cjs');
  const app = mount({ coins: 100, xp: 0, world: { room: 'living' } });
  t.after(app.close);
  const { w, $ } = app;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  Object.defineProperty(w.document, 'hidden', { value: false });
  for (const file of ['world.js', 'experience-ui.js']) {
    w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  const played = [];
  Object.assign(w.HTMLElement.prototype, {
    availableAnimations: ['Idle', 'WalkToBowl', 'Eat', 'WalkHome'],
    duration: 4,
    dismissPoster() {},
    play() { played.push(this.animationName); },
    pause() {},
  });
  w.eval(run);
  loadFoodBowl(w);
  $('#jerryBaby3D').dispatchEvent(new w.Event('load'));
  await settle();
  app.click('#food');
  await settle();
  assert.equal(app.save().xp, 0);
  assert.equal(app.save().world.room, 'kitchen');
  assert.equal(played.at(-1), 'WalkToBowl');
  w.PawtopiaExperienceUI.sync();
  w.PawtopiaWorldUI.refresh();
  await settle();
  assert.equal(played.at(-1), 'WalkToBowl');
  assert($('#food').disabled);
});

test('Real action buttons complete each care route from every permitted room', async t => {
  const { mount } = require('./support/mini-harness.cjs');
  const app = mount({ coins: 100, xp: 0, world: { room: 'living' } });
  t.after(app.close);
  const { w, $ } = app;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  let hidden = false;
  Object.defineProperty(w.document, 'hidden', { get: () => hidden });
  for (const file of ['world.js', 'experience-ui.js']) {
    w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  const actions = [
    ['#food', 'kitchen', ['WalkToBowl', 'Eat', 'WalkHome']],
    ['#sleep', 'bedroom', ['ApproachBed', 'Crouch', 'JumpUp', 'LandOnMattress', 'SettleOnMattress', 'LieDown', 'Sleep', 'WakeUp', 'WalkToBedEdge', 'JumpDown', 'SleepWalkHome']],
    ['#bath', 'bathroom', ['WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome']],
    ['#ball', 'garden', ['WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome']],
    ['#home', 'garden', ['WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'HouseWalkHome']],
    ['[data-kitchen-water]', 'kitchen', ['WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome']],
    ['#dress', null, ['DressTurn']],
  ];
  // Put each action on its XP cooldown so the matrix remains in the Baby stage.
  const save = app.save();
  for (const action of ['Feed', 'Sleep', 'Care', 'Play']) save.xpCooldowns[action] = Date.now();
  assert(w.pawtopiaData.restore(w.PawtopiaSaveTools.create(save, w.localStorage)).ok);
  const played = [];
  const frames = [];
  w.requestAnimationFrame = callback => frames.push(callback);
  Object.assign(w.HTMLElement.prototype, {
    availableAnimations: ['Idle', ...actions.flatMap(action => action[2])],
    duration: 4,
    dismissPoster() {},
    play() {
      this.duration = feedClipDurations[this.animationName] ?? 4;
      played.push(this.animationName);
    },
    pause() {},
  });
  w.eval(run);
  const viewer = $('#jerryBaby3D');
  viewer.dispatchEvent(new w.Event('load'));
  await settle();
  const foodBowl = $('#babyFoodBowl');
  assert.equal(foodBowl.localName, 'model-viewer');
  const materials = loadFoodBowl(w);
  const portions = () => materials.filter(m => m.pbrMetallicRoughness.baseColorFactor[3] === 1).length;
  assert.equal(portions(), 0);
  const room = () => app.save().world.room;
  for (const origin of ['living', 'kitchen', 'bedroom', 'bathroom', 'garden']) {
    for (const [button, destination, clips] of actions) {
      if (button === '[data-kitchen-water]' && origin !== 'kitchen') continue;
      app.click(`[data-room="${origin}"]`);
      await settle();
      played.length = 0;
      app.click(button);
      if (button === '#dress') {
        const outfit = app.save().world.equipped.outfit === 'baby-blue-shirt'
          ? 'baby-yellow-coat' : 'baby-blue-shirt';
        app.click(`[data-dress-item="${outfit}"]`);
        assert.equal(app.save().world.equipped.outfit, outfit);
      }
      const saved = app.save();
      const isFeed = button === '#food';
      const isSleep = button === '#sleep';
      const bowlLevel = () => Number($('#babyFoodBowl').dataset.foodLevel);
      $(button)?.click(); // Immediately repeat the input while care is locked.
      assert.equal(app.save().feedCount, saved.feedCount);
      assert.equal(app.save().hunger, saved.hunger);
      await settle();
      for (const clip of clips) {
        assert.equal(room(), destination ?? origin);
        assert.equal(played.at(-1), clip);
        const expectedSpeed = {
          WalkToBowl: Math.sqrt(1.65), WalkToHouse: 1.2, HouseWalkHome: 1.45,
          EnterHouse: 1.7, ExitHouse: 1.7,
        };
        assert.equal(viewer.timeScale, expectedSpeed[clip] ?? 1);
        assert($('#scene').hasAttribute('data-care-busy'));
        // Safari suppresses frames while the page is in the background.
        for (const visibility of [true, false]) {
          hidden = visibility;
          w.document.dispatchEvent(new w.Event('visibilitychange'));
          await settle();
          assert.equal(played.at(-1), clip);
        }
        if (isFeed && clip === 'WalkToBowl') {
          // Sample the initial turn, every stride and the stationary arrival hold.
          for (let frame = 0; frame <= 235; frame++) {
            viewer.currentTime = frame / 60;
            frames.shift()(frame * 1000 / 60);
            assert.equal(bowlLevel(), 100);
            assert.equal(portions() * 4, 32);
            assert.equal(played.at(-1), clip);
          }
          // The arrival gate uses in-clip progress even after a prolonged pause.
          viewer.paused = true;
          frames.shift()(12000);
          assert.equal(portions() * 4, 32);
          assert.equal(played.at(-1), clip);
          viewer.paused = false;
        } else if (isFeed && clip === 'Eat') {
          for (const [time, pellets] of [[0, 32], [.66, 32], [1.22, 24], [2.10, 16], [2.98, 8], [3.86, 0]]) {
            viewer.currentTime = time;
            frames.shift()();
            assert.equal(portions() * 4, pellets);
            assert.equal(app.save().feedCount, saved.feedCount);
            assert.equal(app.save().hunger, saved.hunger);
            if (pellets === 24) {
              viewer.paused = true;
              frames.shift()(24000);
              assert.equal(portions() * 4, 24);
              assert.equal(played.at(-1), 'Eat');
              viewer.paused = false;
            }
          }
        } else {
          viewer.currentTime = 0.5;
          frames.shift()();
          assert.equal(played.at(-1), clip);
          if (isFeed) assert.equal(portions(), 0);
        }
        viewer.currentTime = isFeed || isSleep || button === '#home' ? viewer.duration : 3.7;
        frames.shift()();
        await settle();
      }
      assert.deepEqual(played, [...clips, 'Idle']);
      assert.equal(viewer.timeScale, 1);
      assert.equal(room(), isFeed || isSleep ? destination : origin);
      if (isFeed) {
        assert.equal(bowlLevel(), 0);
        assert.equal(portions(), 0);
        assert.equal(viewer.style.getPropertyValue('translate'), '');
        assert.equal(app.save().feedCount, saved.feedCount + 1);
        assert.equal(app.save().hunger, Math.min(100, saved.hunger + 35));
      }
      assert(!$('#food').disabled && !$('#scene').hasAttribute('data-care-busy'));
    }
  }
});

test('New Baby loads on its own and replaces the still when the animated model fails', async t => {
  const { window } = new JSDOM(
    '<div id="roomCanvas" class="room-living"><div id="scene" data-growth-stage="Baby"></div></div>',
    { runScripts: 'outside-only', url: 'https://preview.example/?babyModel=25k' },
  );
  t.after(() => window.close());
  window.HTMLElement.prototype.dismissPoster = () => {};
  window.eval(run);
  const scene = window.document.getElementById('scene');
  const legacy = window.document.getElementById('jerryBaby3D');
  const candidate = window.document.getElementById('jerryBabyTest3D');
  assert.match(candidate.getAttribute('src'), /jerry_puppy_25k_tris\.glb$/);
  assert.equal(candidate.hidden, false);

  legacy.dispatchEvent(new window.Event('error'));
  candidate.dispatchEvent(new window.Event('load'));
  const visible = () => scene.classList.contains('baby-test-model-visible');
  assert.equal(visible(), true);

  for (const stage of ['Puppy', 'Adult', 'Baby']) {
    scene.dataset.growthStage = stage;
    await settle();
    assert.equal(visible(), stage === 'Baby');
    assert.equal(candidate.hidden, stage !== 'Baby');
  }
  candidate.dispatchEvent(new window.Event('error'));
  await settle();
  assert.equal(visible(), false);
  assert.equal(window.document.getElementById('jerryBabyTest3D'), null);
});
