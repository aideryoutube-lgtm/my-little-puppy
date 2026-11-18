// Reuse the local model-viewer renderer and keep the original Baby image as a fallback.
const scene = document.getElementById('scene');
const canvas = document.getElementById('roomCanvas');
let viewer;
let ready = false;
let failed = false;
let clip = '';
let walkTimer;
let currentRoom = '';
let care;
let wardrobe = [];
let fur;
let dryFur;
let wetness = 0;
let foodLayer;
let pellets = [];
let foodLevel = 0;

// The closed-fridge artwork is 941 × 1672. Both the stage mark and the
// food layer use pixels from the same crop around the rim of the blue bowl.
const bowl = { x: 790, y: 1072, width: 110, height: 64, centerX: 847.6, centerY: 1111.5 };
const feedTurn = .48;
const feedWalk = 5 * .58; // Five planted-paw cycles in rig-jerry-baby.py.
const biteStart = .66;
const biteCycle = .88;

function makeFoodLayer() {
  foodLayer = document.createElement('div');
  foodLayer.id = 'babyFoodBowl';
  foodLayer.setAttribute('aria-hidden', 'true');
  Object.assign(foodLayer.style, {
    left: (100 * bowl.x / 941) + '%',
    top: (100 * bowl.y / 1672) + '%',
    width: (100 * bowl.width / 941) + '%',
    height: (100 * bowl.height / 1672) + '%'
  });
  const pieces = Array.from({ length: 32 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = Math.sqrt((index + .5) / 32);
    const x = 57.6 + 35 * radius * Math.cos(angle);
    const y = 38 + 15 * radius * Math.sin(angle);
    return { index, x, y, angle: (index * 131) % 180 };
  });
  const shapes = pieces.sort((a, b) => a.y - b.y).map(({ index, x, y, angle }) =>
    `<ellipse data-piece="${index}" cx="${x}" cy="${y}" rx="${5 + index % 3}" ry="4"
      transform="rotate(${angle} ${x} ${y})" fill="url(#babyKibbleColor)"/>`).join('');
  foodLayer.innerHTML = `<svg viewBox="0 0 110 64" preserveAspectRatio="none">
    <defs><radialGradient id="babyKibbleColor" cx="32%" cy="25%" r="78%">
      <stop stop-color="#efb467"/><stop offset=".52" stop-color="#b76a2c"/>
      <stop offset="1" stop-color="#62350e"/>
    </radialGradient></defs>${shapes}</svg>`;
  scene.prepend(foodLayer);
  pellets = [...foodLayer.querySelectorAll('[data-piece]')]
    .sort((a, b) => Number(a.dataset.piece) - Number(b.dataset.piece));
  setFoodLevel(0);
}

function setFoodLevel(level) {
  foodLevel = level;
  if (!foodLayer) return;
  foodLayer.dataset.foodLevel = String(Math.round(level * 100));
  // Lose outer pieces first. Each piece fades during the bite that takes it.
  for (const [index, piece] of pellets.entries()) {
    const opacity = String(Math.max(0, Math.min(1, level * pellets.length - index)));
    if (piece.style.opacity !== opacity) piece.style.opacity = opacity;
  }
}

function biteProgress(time) {
  const elapsed = Math.max(0, time - biteStart);
  const bites = Math.floor(elapsed / biteCycle);
  const fraction = Math.min(1, (elapsed - bites * biteCycle) / .55);
  return Math.min(1, (bites + fraction) / 4);
}

// Project the lowered muzzle (the GLB pose at the first bite) through the
// current model-viewer camera. The GLB handles the gait and planar translation.
// The screen correction aligns that plane to the floor painted in the kitchen.
function foodMark() {
  if (!viewer.getCameraTarget) return [0, 0];
  const target = viewer.getCameraTarget();
  const { theta, phi, radius } = viewer.getCameraOrbit();
  const view = viewer.getBoundingClientRect();
  const room = scene.getBoundingClientRect();
  const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  // Feed heading is 120 degrees. Muzzle projection is 1.275 m of
  // root translation plus 0.965 m forward to the muzzle.
  const distance = 2.24;
  const x = distance * Math.sin(2 * Math.PI / 3) - target.x;
  const y = -.30 - target.y;
  const z = distance * Math.cos(2 * Math.PI / 3) - target.z;
  const forward = x * sinTheta + z * cosTheta;
  const focal = view.height / (2 * Math.tan(viewer.getFieldOfView() * Math.PI / 360));
  const scale = focal / (radius - (forward * sinPhi + y * cosPhi));
  const muzzleX = view.left + view.width / 2 + scale * (x * cosTheta - z * sinTheta);
  const muzzleY = view.top + view.height / 2 -
    scale * (y * sinPhi - forward * cosPhi);
  return [
    room.left + room.width * bowl.centerX / 941 - muzzleX,
    room.top + room.height * bowl.centerY / 1672 - muzzleY
  ];
}

function positionFeeding(name, time) {
  if (!care.foodMark) care.foodMark = foodMark();
  const travel = Math.max(0, Math.min(1, (time - feedTurn) / feedWalk));
  const amount = name === 'WalkToBowl' ? travel : name === 'WalkHome' ? 1 - travel : 1;
  const [x, y] = care.foodMark;
  viewer.style.setProperty('translate', `${x * amount}px ${y * amount}px`);
  if (name === 'Eat') {
    const remaining = 1 - biteProgress(time);
    if (foodLevel !== remaining) setFoodLevel(remaining);
  }
}
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
  feed: { room: 'kitchen', route: [.44, .94, .63, .78], clips: ['WalkToBowl', 'Eat', 'WalkHome'] },
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
  if (request !== playbackRequest || viewer !== target || target.hidden) return;
  const sequenceClip = Boolean(care && name !== 'Idle');
  if (sequenceClip && care.action === 'feed') positionFeeding(name, 0);
  if (sequenceClip) target.currentTime = 0;
  target.play(name === 'Idle' || sequenceClip ? {} : { repetitions: 1, pingpong: false });
  if (name === 'Idle' && motionReduced()) target.pause();
  if (care && !(target.duration > 0)) {
    stopCare('Renderer did not select clip ' + name, true);
    return;
  }
  if (sequenceClip) {
    careDebug('clip started: ' + name);
    // Hold each end pose in the GLB and transition while the mixer is live.
    // A one-shot finished event pauses model-viewer before it can crossfade.
    let previousTime = 0;
    let lastProgressAt;
    function blendAtEnd(timestamp) {
      if (request !== playbackRequest || viewer !== target || !care) return;
      const time = target.currentTime;
      // On a slow frame the mixer may wrap past the terminal hold.
      const looped = time < previousTime;
      if (care.action === 'feed') positionFeeding(name, looped ? target.duration : time);
      if (name === 'BathWash') wetFur(Math.min(1, time / .65));
      if (name === 'BathShake') wetFur(Math.max(0, Math.min(1, (1.55 - time) / .72)));
      if (target.duration > 0 && (time >= target.duration - .36 || looped)) {
        advanceCare();
      } else {
        // model-viewer suspends its mixer when scrolled out of view.
        if (!target.modelIsVisible || document.hidden || time !== previousTime) lastProgressAt = timestamp;
        lastProgressAt ??= timestamp;
        if (timestamp - lastProgressAt > 4000) {
          stopCare('Playback stalled in ' + name, true);
          return;
        }
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

function careDebug(message) {
  window.dispatchEvent(new CustomEvent('baby-care-debug', { detail: message }));
}

function roomName() {
  return [...canvas.classList].find(name => /^room-(living|kitchen|bedroom|bathroom|garden)$/.test(name))
    ?.slice('room-'.length);
}

function stopCare(reason, restoreRoom = false) {
  const origin = care?.origin;
  if (care) careDebug(care.action + ': ' + reason);
  const meal = care?.action === 'feed' && care;
  care = undefined;
  if (meal) {
    setFoodLevel(0);
    viewer.style.removeProperty('translate');
  }
  playbackRequest++;
  clearTimeout(walkTimer);
  wetFur(0);
  lockCare(false);
  if (restoreRoom && origin && roomName() !== origin) {
    const result = window.pawtopiaWorld?.commit('room', origin);
    if (!result?.ok) careDebug('Could not restore room: ' + (result?.message ?? origin));
  }
  currentRoom = roomName();
  if (ready && !viewer.hidden && viewer.availableAnimations?.includes('Idle')) idle();
}

function playCareClip() {
  const index = care.index;
  const last = care.clips.length - 1;
  care.state = last === 0 ? 'PerformingAction' : index === 0 ? 'Moving' :
    index === last ? 'Returning' : 'PerformingAction';
  const name = care.clips[index];
  careDebug(care.state + ': ' + name);
  play(name).catch(error => stopCare('Playback failed: ' + error.message, true));
}

function startCare() {
  if (!care || care.state !== 'WaitingForRoom' || !ready || viewer.hidden || document.hidden) return;
  if (roomName() !== care.room) return;
  const missing = care.clips.filter(name => !viewer.availableAnimations?.includes(name));
  if (missing.length) return stopCare('Missing clips: ' + missing.join(', '), true);
  if (roomBlocked()) return stopCare('Room is covered by a dialog or decor editor', true);
  if (care.route && !clearCareRoute(care.route)) return stopCare('Decoration in the walking path', true);
  if (care.action === 'feed') setFoodLevel(1);
  playCareClip();
}

function advanceCare() {
  careDebug('clip finished: ' + care.clips[care.index]);
  care.index++;
  if (care.action === 'feed' && care.clips[care.index - 1] === 'Eat') setFoodLevel(0);
  if (care.index < care.clips.length) return playCareClip();
  const meal = care.action === 'feed' ? care : undefined;
  stopCare('completed', !meal);
  meal?.finishMeal?.();
}

function finished() {
  // Care clips advance before the authored end hold expires. Only Walk and
  // Happy use the renderer's one-shot completion event.
  if (!care && (clip === 'Walk' || clip === 'Happy')) idle();
}

function idle() {
  clearTimeout(walkTimer);
  play('Idle');
  if (motionReduced() || document.hidden) return;
  walkTimer = setTimeout(function stroll() {
    if (!viewer || viewer.hidden || document.hidden || care || clip !== 'Idle') return;
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
      src: 'assets/models/Jerry_Baby_Animated.glb?v=7',
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
      if (!care && viewer.availableAnimations?.includes('Idle')) idle();
    });
    viewer.addEventListener('finished', finished);
    viewer.addEventListener('error', () => {
      clearTimeout(walkTimer);
      failed = true;
      ready = false;
      stopCare('Model failed to load', true);
      careDebug('Model failed to load');
      viewer.remove();
      viewer = undefined;
      wardrobe = [];
      fur = undefined;
      sync();
    });
    scene.prepend(viewer);
    if (!foodLayer) makeFoodLayer();
  }
  if (viewer) {
    const room = roomName();
    const changed = viewer.hidden === show || currentRoom !== room;
    currentRoom = room;
    viewer.hidden = !show;
    if (!show && changed) {
      stopCare('Baby viewer hidden');
      viewer.pause();
    } else if (show && ready) {
      if (care && room !== care.room) stopCare('Room changed by player');
      else if (care) startCare();
      else if (changed && clip) idle();
    }
  }
  scene.classList.toggle('jerry-baby-3d-ready', show && ready);
}

scene.addEventListener('pawtopia-jerry-action', event => {
  const { action, finishMeal } = event.detail;
  const origin = roomName();
  if (scene.dataset.growthStage !== 'Baby' || !origin) return;
  const config = Object.hasOwn(careActions, action) ? careActions[action] :
    action === 'dress-show' ? { room: origin, clips: ['DressTurn'] } : undefined;
  if (!config && action !== 'touch') return;
  if (finishMeal && care) event.preventDefault();
  if (failed || care || viewer?.hidden || motionReduced()) {
    careDebug('Ignored ' + action + ': ' + (care ? 'busy' : 'viewer or motion setting'));
    return;
  }
  if (action === 'touch') {
    if (!ready || !clip || clip === 'Happy') return;
    clearTimeout(walkTimer);
    play('Happy');
    return;
  }
  if (action === 'house' && !window.pawtopiaWorld?.snapshot().hasHome) {
    careDebug('House is unavailable until owned');
    return;
  }
  if (action === 'drink' && origin !== 'kitchen') {
    careDebug('Drink requires the kitchen');
    return;
  }
  if (roomBlocked()) {
    careDebug('Ignored ' + action + ': room blocked');
    return;
  }
  if (finishMeal) event.preventDefault();
  clearTimeout(walkTimer);
  care = { ...config, action, origin, finishMeal, index: 0, state: 'WaitingForRoom' };
  lockCare(true);
  careDebug('WaitingForRoom: ' + action + ' in ' + config.room);
  if (origin !== config.room) {
    const result = window.pawtopiaWorld?.commit('room', config.room);
    if (!result?.ok) stopCare('Room switch failed: ' + (result?.message ?? config.room));
    // The room observer starts playback after the destination mounts.
  } else startCare();
});

let lastReducedMotion = Boolean(motionReduced());
function syncMotion() {
  const reduced = Boolean(motionReduced());
  if (lastReducedMotion === reduced) return;
  lastReducedMotion = reduced;
  if (ready && viewer && !viewer.hidden && clip) stopCare('Motion preference changed', true);
}
reducedMotion?.addEventListener?.('change', syncMotion);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(walkTimer);
    return;
  }
  if (!ready || viewer.hidden) return;
  // The browser suspends animation frames while hidden. Keep the current
  // mixer time and continue the same clip or start the queued request.
  if (care) startCare();
  else if (clip === 'Idle') idle();
});
new MutationObserver(syncMotion).observe(document.documentElement, {
  attributes: true, attributeFilter: ['data-effects']
});

const observer = new MutationObserver(sync);
observer.observe(scene, { attributes: true, attributeFilter: ['class', 'data-growth-stage'] });
observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
sync();
