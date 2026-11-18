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
