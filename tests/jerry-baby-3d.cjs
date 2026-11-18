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

test('Animated Baby has a weighted skin, blink morph and the original plus feeding clips', () => {
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
  assert.deepEqual(gltf.animations.map(clip => clip.name), ['Idle', 'Walk', 'Happy', 'WalkToBowl', 'Eat', 'WalkHome']);
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

test('Feed clips share the existing skeleton, match their root poses and animate the muzzle', () => {
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
    const width = { VEC3: 3, VEC4: 4 }[accessor.type];
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
