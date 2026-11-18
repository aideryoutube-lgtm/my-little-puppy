// Reuse the local model-viewer renderer and keep the original Baby image as a fallback.
const scene = document.getElementById('scene');
const canvas = document.getElementById('roomCanvas');
let viewer;
let ready = false;
let failed = false;
let clip = '';
let walkTimer;
let currentRoom = '';
let pendingAction;
let sequence;
let returnRoom;
let wardrobe = [];
let fur;
let dryFur;
let wetness = 0;
const clothing = {
  'Blue T-shirt': { slot: 'outfit', id: 'baby-blue-shirt' },
  'Yellow Raincoat': { slot: 'outfit', id: 'baby-yellow-coat' },
  'Red Cap': { slot: 'hat', id: 'baby-red-cap' }
};
const careButtons = ['food', 'sleep', 'bath', 'ball', 'dress', 'home'];

function lockCare(locked) {
  scene.toggleAttribute('data-care-busy', locked);
  for (const id of careButtons) {
    const button = document.getElementById(id);
    if (button) button.disabled = locked;
  }
}

function syncClothes() {
  if (!wardrobe.length) return;
  const equipped = window.pawtopiaWorld?.snapshot().world?.equipped;
  for (const { material, slot, id } of wardrobe) {
    const [r, g, b, a] = material.baseColorFactor;
    const visible = Number(equipped?.[slot] === id);
    if (a !== visible) material.setBaseColorFactor([r, g, b, visible]);
  }
}

function wetFur(amount) {
  if (!fur || amount === wetness) return;
  wetness = amount;
  fur.setBaseColorFactor(dryFur.color.map((channel, i) => i === 3 ? channel : channel * (1 - amount * .36)));
  fur.setRoughnessFactor(dryFur.roughness * (1 - amount * .78));
}
document.addEventListener('pawtopia-state', syncClothes);
const careActions = {
  care: { room: 'bathroom', route: [.40, .86, .53, .79],
    clips: ['WalkToBath', 'BathSit', 'BathWash', 'BathShake', 'BathWalkHome'] },
  feed: { room: 'kitchen', route: [.35, .91, .61, .77], clips: ['WalkToBowl', 'Eat', 'WalkHome'] },
  house: { room: 'garden', route: [.19, .66, .64, .78],
    clips: ['WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome'] },
  drink: { room: 'kitchen', route: [.44, .95, .71, .82],
    clips: ['WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome'] },
  sleep: { room: 'bedroom', route: [.38, .81, .52, .74],
    clips: ['WalkToBed', 'LieDown', 'Sleep', 'WakeUp', 'SleepWalkHome'] },
  play: { room: 'garden', route: [.42, .98, .59, .81],
    clips: ['WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome'] }
};
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

let playbackRequest = 0;
async function play(name) {
  const request = ++playbackRequest;
  const target = viewer;
  clip = name;
  target.animationName = name;
  wetFur(name === 'BathShake' ? 1 : 0);
  // The renderer applies animationName asynchronously with its default loop mode.
  await target.updateComplete;
  if (request !== playbackRequest || viewer !== target || target.hidden || document.hidden) return;
  const sequenceClip = Boolean(sequence && name !== 'Idle');
  if (sequenceClip) target.currentTime = 0;
  target.play(name === 'Idle' || sequenceClip ? {} : { repetitions: 1, pingpong: false });
  if (name === 'Idle' && motionReduced()) target.pause();
  if (sequenceClip) {
    // Hold each end pose in the GLB and transition while the mixer is live.
    // A one-shot finished event pauses model-viewer before it can crossfade.
    let previousTime = 0;
    function blendAtEnd() {
      if (request !== playbackRequest || viewer !== target || !sequence) return;
      const time = target.currentTime;
      if (name === 'BathWash') wetFur(Math.min(1, time / .65));
      if (name === 'BathShake') wetFur(Math.max(0, Math.min(1, (1.55 - time) / .72)));
      if (target.duration > 0 && (time >= target.duration - .36 || time < previousTime)) {
        finished();
      } else {
        previousTime = time;
        window.requestAnimationFrame(blendAtEnd);
      }
    }
    window.requestAnimationFrame(blendAtEnd);
  }
}

function motionReduced() {
  return reducedMotion?.matches || document.documentElement.dataset.effects === 'minimal';
}

function roomBlocked() {
  return Boolean(canvas.closest('.decor-editing') || scene.classList.contains('decor-editing') ||
    ['worldOverlay', 'miniOverlay', 'shopOverlay'].some(id => {
      const overlay = document.getElementById(id);
      return overlay && !overlay.hidden;
    }));
}

function clearFloor(left, right, top, bottom) {
  return !Array.from(canvas.querySelectorAll('.room-decoration')).some(item => {
    const decor = item.getBoundingClientRect();
    return decor.right > left && decor.left < right && decor.bottom > top && decor.top < bottom;
  });
}

function canWalk() {
  if (roomBlocked()) return false;
  const box = viewer.getBoundingClientRect();
  const floor = box.top + box.height * .804;
  return clearFloor(box.left + box.width * .20, box.right - box.width * .15,
    floor - box.height * .38, floor + box.height * .20);
}

function clearCareRoute([left, right, top, bottom]) {
  const room = canvas.getBoundingClientRect();
  return clearFloor(room.left + room.width * left, room.left + room.width * right,
    room.top + room.height * top, room.top + room.height * bottom);
}

function cancelCare() {
  lockCare(false);
  wetFur(0);
  pendingAction = undefined;
  sequence = undefined;
  returnRoom = undefined;
}

function startCare() {
  if (!pendingAction || !ready || viewer.hidden || document.hidden || clip !== 'Idle') return;
  const request = pendingAction;
  const action = careActions[request];
  pendingAction = undefined;
  if ((request === 'house' && !window.pawtopiaWorld?.snapshot().hasHome) ||
      motionReduced() || roomBlocked() ||
      !action.clips.every(name => viewer.availableAnimations?.includes(name))) {
    cancelCare();
    return;
  }
  const origin = currentRoom;
  if (origin !== 'room-' + action.room) {
    if (!origin || !window.pawtopiaWorld?.commit('room', action.room).ok) {
      cancelCare();
      return;
    }
    returnRoom = origin.slice('room-'.length);
  }
  if (!clearCareRoute(action.route)) {
    if (returnRoom) window.pawtopiaWorld.commit('room', returnRoom);
    cancelCare();
    return;
  }
  clearTimeout(walkTimer);
  sequence = action;
  lockCare(true);
  play(action.clips[0]);
}

function finished() {
  if (sequence) {
    const next = sequence.clips[sequence.clips.indexOf(clip) + 1];
    if (next) {
      play(next);
      return;
    }
    const origin = returnRoom;
    cancelCare();
    if (origin) window.pawtopiaWorld.commit('room', origin);
  }
  if (clip !== 'Idle') idle();
}

function idle() {
  clearTimeout(walkTimer);
  lockCare(false);
  play('Idle');
  startCare();
  if (sequence || motionReduced()) return;
  walkTimer = setTimeout(function stroll() {
    if (!viewer || viewer.hidden || document.hidden || clip !== 'Idle') return;
    if (canWalk()) play('Walk');
    else walkTimer = setTimeout(stroll, 8000);
  }, 8500);
}

function sync() {
  const isBaby = scene.dataset.growthStage === 'Baby';
  const show = isBaby && !canvas.classList.contains('jerry-3d-ready');
  if (show && !viewer && !failed) {
    viewer = document.createElement('model-viewer');
    viewer.id = 'jerryBaby3D';
    viewer.setAttribute('aria-hidden', 'true'); // The existing Pet Jerry control handles interaction.
    for (const [name, value] of Object.entries({
      src: 'assets/models/Jerry_Baby_Animated.glb?v=6',
      'animation-crossfade-duration': '250',
      loading: 'eager',
      'interaction-prompt': 'none',
      'disable-tap': '',
      'camera-orbit': '30deg 85deg 6m',
      'field-of-view': '30deg',
      'min-camera-orbit': 'auto auto 6m',
      'max-camera-orbit': 'auto auto 6m',
      exposure: '1.05',
      'shadow-intensity': '0.7'
    })) viewer.setAttribute(name, value);
    viewer.addEventListener('load', () => {
      const materials = viewer.model?.materials ?? [];
      wardrobe = materials.filter(material => Object.hasOwn(clothing, material.name))
        .map(material => ({ ...clothing[material.name], material: material.pbrMetallicRoughness }));
      fur = materials.find(material => material.name === 'BakedMaterial')?.pbrMetallicRoughness;
      if (fur) dryFur = { color: Array.from(fur.baseColorFactor), roughness: fur.roughnessFactor };
      syncClothes();
      ready = true;
      viewer.dismissPoster();
      sync();
      if (viewer.availableAnimations?.includes('Idle')) idle();
    });
    viewer.addEventListener('finished', finished);
    viewer.addEventListener('error', () => {
      clearTimeout(walkTimer);
      failed = true;
      ready = false;
      cancelCare();
      viewer.remove();
      viewer = undefined;
      wardrobe = [];
      fur = undefined;
      sync();
    });
    scene.prepend(viewer);
  }
  if (viewer) {
    const room = [...canvas.classList].find(name => /^room-(living|kitchen|bedroom|bathroom|garden)$/.test(name));
    const changed = viewer.hidden === show || currentRoom !== room;
    // A care request can switch rooms before MutationObserver runs.
    const enteringCareRoom = sequence && returnRoom && room === 'room-' + sequence.room;
    currentRoom = room;
    viewer.hidden = !show;
    if (ready && clip && changed && !(show && enteringCareRoom)) {
      cancelCare();
      if (show) idle();
      else {
        clearTimeout(walkTimer);
        viewer.pause();
      }
    }
  }
  scene.classList.toggle('jerry-baby-3d-ready', show && ready);
}

scene.addEventListener('pawtopia-jerry-action', event => {
  const { action } = event.detail;
  if (Object.hasOwn(careActions, action) && scene.dataset.growthStage === 'Baby') {
    if (failed || sequence || pendingAction || clip === 'DressTurn' || motionReduced()) return;
    if (action === 'house' && !window.pawtopiaWorld?.snapshot().hasHome) return;
    if (action === 'drink' && currentRoom !== 'room-kitchen') return;
    pendingAction = action;
    if (ready && !viewer.hidden) lockCare(true);
    startCare();
    return;
  }
  if (action === 'dress-show' && ready && !viewer.hidden && !sequence && !pendingAction && clip !== 'DressTurn' && !roomBlocked() &&
      !motionReduced() && viewer.availableAnimations?.includes('DressTurn')) {
    clearTimeout(walkTimer);
    lockCare(true);
    play('DressTurn');
    return;
  }
  if (action !== 'touch' || !ready || viewer.hidden || !clip ||
      sequence || pendingAction || clip === 'Happy' || clip === 'DressTurn' || motionReduced()) return;
  clearTimeout(walkTimer);
  play('Happy');
});

function syncMotion() {
  if (ready && viewer && !viewer.hidden && clip) {
    cancelCare();
    idle();
  }
}
reducedMotion?.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', () => {
  if (!ready || !viewer || viewer.hidden || !clip) return;
  if (document.hidden) {
    cancelCare();
    clearTimeout(walkTimer);
    viewer.pause();
  } else idle();
});
new MutationObserver(syncMotion).observe(document.documentElement, {
  attributes: true, attributeFilter: ['data-effects']
});

const observer = new MutationObserver(sync);
observer.observe(scene, { attributes: true, attributeFilter: ['class', 'data-growth-stage'] });
observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
sync();
