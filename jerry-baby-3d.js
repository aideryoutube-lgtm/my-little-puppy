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
let foodFailed = false;
let foodMaterials = [];
let foodLevel = 0;

// The rim is anchored to an artwork pixel in the 941 × 1672 portrait kitchen.
// Use the same anchor for the prop's camera target and Jerry's lowered muzzle.
const bowl = { centerX: 847.6, centerY: 1103.5, width: 190, height: 172 };
const feedTurn = .48;
const feedWalk = 5 * .58; // Five planted-paw cycles in rig-jerry-baby.py.
const feedArrival = feedTurn + feedWalk;
const biteEnds = [1.21, 2.09, 2.97, 3.85];
const sleepStates = {
  ApproachBed: 'WalkingToBed', Crouch: 'PreparingToJump', JumpUp: 'Jumping',
  LandOnMattress: 'Landing', SettleOnMattress: 'GettingComfortable',
  LieDown: 'LyingDown', Sleep: 'Sleeping', WakeUp: 'WakingUp',
  WalkToBedEdge: 'WalkingToEdge', JumpDown: 'JumpingDown', SleepWalkHome: 'WalkingHome'
};

// Fractions of Bedroom.png. Positions mark the surface between Jerry's paws.
const bedroomStart = [.39, .6886875, 1];
const bedTakeoff = [.64, .473, .77];
const bedEdge = [.705, .330, .69];
const bedCenter = [.758, .317, .65];

function positionSleeping(name, time, duration) {
  const progress = Math.max(0, Math.min(1, time / duration));
  const fraction = (start, length) => Math.max(0, Math.min(1, (time - start) / length));
  let from = bedCenter;
  let to = bedCenter;
  let travel = 0;
  let lift = 0;
  let compression = 0;
  switch (name) {
    case 'ApproachBed':
      [from, to, travel] = [bedroomStart, bedTakeoff, fraction(.5, 2.8)];
      break;
    case 'Crouch':
      from = to = bedTakeoff;
      break;
    case 'JumpUp':
      [from, to, travel] = [bedTakeoff, bedEdge, progress];
      lift = .115 * 4 * progress * (1 - progress);
      break;
    case 'LandOnMattress':
      from = to = bedEdge;
      compression = .006 * Math.sin(Math.PI * progress);
      break;
    case 'SettleOnMattress':
      [from, to, travel] = [bedEdge, bedCenter, fraction(0, .85)];
      break;
    case 'WalkToBedEdge':
      [from, to, travel] = [bedCenter, bedEdge, fraction(.52, .85)];
      break;
    case 'JumpDown':
      [from, to, travel] = [bedEdge, bedTakeoff, progress];
      lift = .095 * 4 * progress * (1 - progress);
      break;
    case 'SleepWalkHome':
      [from, to, travel] = [bedTakeoff, bedroomStart, fraction(.26, 2.8)];
      break;
  }
  const [x, y, size] = from.map((value, i) => value + (to[i] - value) * travel);
  scene.style.setProperty('--sleep-x', `${x * 100}%`);
  scene.style.setProperty('--sleep-y', `${(y - lift + compression) * 100}%`);
  scene.style.setProperty('--sleep-scale', size);
  scene.style.setProperty('--mattress-load', String(compression / .006));
  scene.classList.add('baby-bed-route');
  scene.classList.toggle('baby-on-mattress', ['LandOnMattress', 'SettleOnMattress',
    'LieDown', 'Sleep', 'WakeUp', 'WalkToBedEdge'].includes(name) ||
    (name === 'JumpUp' && progress >= .88) || (name === 'JumpDown' && progress <= .12));
}
// Floor anchors are normalized to the shared 941 × 1672 garden artwork.
const houseThreshold = [792 / 941, 771 / 1672, .60];
const houseCushion = [792 / 941, 699 / 1672, .49];
const houseDoorHeading = 210;
const houseEntryTime = 3 * .58;
const houseTurn = .5;
const houseStrideTime = .58;
const houseStrides = 7;
const gardenCamera = 30;

const houseTravel = {
  EnterHouse: [houseThreshold, houseCushion, .25, houseEntryTime],
  RestInside: [houseCushion, houseCushion, 0, 1],
  ExitHouse: [houseCushion, houseThreshold, .25, houseEntryTime],
  Stretch: [houseThreshold, houseThreshold, 0, 1]
};

function clampProgress(value) {
  return Math.max(0, Math.min(1, value));
}

function turnHeading(from, to, fraction) {
  const t = clampProgress(fraction);
  const difference = ((to - from + 180) % 360 + 360) % 360 - 180;
  return from + difference * t * t * (3 - 2 * t);
}

function setGardenHeading(heading) {
  if (!viewer.jumpCameraToGoal) return;
  const orbit = `${gardenCamera - heading}deg 85deg 6m`;
  if (viewer.cameraOrbit === orbit) return;
  viewer.cameraOrbit = orbit;
  viewer.jumpCameraToGoal();
}

// Walk carries its own root displacement. Sample the same floor path as the
// rig when House interrupts a stroll, then move that offset into the 2D layer.
function gardenPose(includeStroll) {
  const room = scene.getBoundingClientRect();
  const model = viewer.getBoundingClientRect();
  const style = getComputedStyle(viewer);
  const scale = parseFloat(style.scale) || 1.875;
  if (!room.width || !room.height) {
    return { point: [parseFloat(style.getPropertyValue('--baby-center') || '60%') / 100,
      1 - parseFloat(style.getPropertyValue('--baby-floor') || '24%') / 100 + .000132, scale / 1.875],
      heading: 0 };
  }
  const point = [(model.left + model.width / 2 - room.left) / room.width,
    (model.top + model.height * .804 - room.top) / room.height, scale / 1.875];
  if (!includeStroll || clip !== 'Walk' || !viewer.getCameraOrbit) return { point, heading: 0 };

  // These are the two passes and two turns in rig-jerry-baby.py's Walk.
  const pass = 1.72;
  const turn = .64;
  const time = viewer.currentTime;
  const direction = 1.05;
  const degrees = direction * 180 / Math.PI;
  const strollTurn = (start, fraction) => {
    const t = clampProgress(fraction);
    return start + 180 * t * t * (3 - 2 * t);
  };
  let distance;
  let heading;
  if (time < pass) {
    distance = .51 * time / pass;
    heading = degrees;
  } else if (time < pass + turn) {
    distance = .51;
    heading = strollTurn(degrees, (time - pass) / turn);
  } else if (time < 2 * pass + turn) {
    distance = .51 * (1 - (time - pass - turn) / pass);
    heading = degrees - 180;
  } else {
    distance = 0;
    heading = strollTurn(degrees + 180, (time - 2 * pass - turn) / turn);
  }

  const camera = viewer.getCameraOrbit();
  const target = viewer.getCameraTarget();
  const focal = model.height / (2 * Math.tan(viewer.getFieldOfView() * Math.PI / 360));
  function projectGround(travel) {
    const x = travel * Math.sin(direction) - target.x;
    const y = -.85 - target.y;
    const z = travel * Math.cos(direction) - target.z;
    const depth = x * Math.sin(camera.theta) + z * Math.cos(camera.theta);
    const ratio = focal / (camera.radius - depth * Math.sin(camera.phi) - y * Math.cos(camera.phi));
    return [ratio * (x * Math.cos(camera.theta) - z * Math.sin(camera.theta)),
      ratio * (depth * Math.cos(camera.phi) - y * Math.sin(camera.phi))];
  }
  const [x, y] = projectGround(distance);
  const [baseX, baseY] = projectGround(0);
  point[0] += (x - baseX) / room.width;
  point[1] += (y - baseY) / room.height;
  return { point, heading };
}

function setGardenPoint(prefix, [x, y, size]) {
  scene.style.setProperty(`--${prefix}-x`, x * 100 + '%');
  scene.style.setProperty(`--${prefix}-y`, y * 100 + '%');
  scene.style.setProperty(`--${prefix}-scale`, 1.875 * size);
}

function positionAtHouse(name, time, clipDuration) {
  const outward = name === 'WalkToHouse';
  const lawn = outward || name === 'HouseWalkHome';
  const start = care.houseStart.point;
  const walkTime = (care.houseStrideCount ?? houseStrides) * houseStrideTime;
  const [from, to, delay, duration] = lawn ?
    [outward ? start : houseThreshold, outward ? houseThreshold : start, houseTurn, walkTime] :
    houseTravel[name];
  const progress = time >= clipDuration ? 1 : clampProgress((time - delay) / duration);
  // Advance at constant ground speed. The artwork's near end projects more
  // pixels per step, so interpolate the fixed floor anchors in perspective.
  const travel = progress * to[2] / (from[2] + (to[2] - from[2]) * progress);
  setGardenPoint('house', from.map((value, i) => value + (to[i] - value) * travel));
  if (lawn) {
    const initial = outward ? care.houseStart.heading : houseDoorHeading + 180;
    const final = outward ? houseDoorHeading : 0;
    const forward = care.houseHeading + (outward ? 0 : 180);
    const heading = time < houseTurn ? turnHeading(initial, forward, time / houseTurn) :
      turnHeading(forward, final, (time - houseTurn - walkTime) / (outward ? .24 : .5));
    setGardenHeading(heading);
  } else {
    // The doorway, rest and stretch clips already carry their heading.
    setGardenHeading(0);
  }
  const depth = name === 'RestInside' ? 1 :
    name === 'EnterHouse' ? progress : name === 'ExitHouse' ? 1 - progress : 0;
  // The same fixed facade covers the body from the first entering step
  // through the last exiting step, including the sill in front of the paws.
  scene.classList.add('baby-house-route');
  scene.classList.toggle('baby-house-occluded', depth > 0);
}

const feedStates = { WalkToBowl: 'WalkingToBowl', Eat: 'Eating', WalkHome: 'WalkingHome' };

function makeFoodLayer() {
  foodLayer = document.createElement('model-viewer');
  foodLayer.id = 'babyFoodBowl';
  foodLayer.setAttribute('aria-hidden', 'true');
  for (const [name, value] of Object.entries({
    src: 'assets/models/KitchenFoodBowl.glb',
    loading: 'eager',
    'interaction-prompt': 'none',
    'disable-tap': '',
    'camera-target': '0m 0.61m 0m',
    'camera-orbit': '0deg 62deg 4.2m',
    'min-camera-orbit': 'auto auto 4.2m',
    'max-camera-orbit': 'auto auto 4.2m',
    'field-of-view': '30deg',
    'shadow-intensity': '.65',
    exposure: '1.1'
  })) foodLayer.setAttribute(name, value);
  Object.assign(foodLayer.style, {
    left: (100 * bowl.centerX / 941) + '%',
    top: (100 * bowl.centerY / 1672) + '%',
    width: (100 * bowl.width / 941) + '%',
    height: (100 * bowl.height / 1672) + '%'
  });
  foodLayer.addEventListener('load', () => {
    foodMaterials = foodLayer.model.materials
      .filter(material => /^Kibble [1-8]$/.test(material.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(material => material.pbrMetallicRoughness);
    setFoodLevel(foodLevel);
    scene.classList.add('baby-food-bowl-ready');
    startCare();
  });
  foodLayer.addEventListener('error', () => {
    foodMaterials = [];
    foodFailed = true;
    scene.classList.remove('baby-food-bowl-ready');
    if (care?.action === 'feed') stopCare('Food bowl failed to load', true);
  });
  const rug = document.createElement('div');
  rug.id = 'babyFoodRug';
  rug.setAttribute('aria-hidden', 'true');
  scene.prepend(rug, foodLayer);
  setFoodLevel(0);
}

function setFoodLevel(level) {
  foodLevel = level;
  if (!foodLayer) return;
  foodLayer.dataset.foodLevel = String(Math.round(level * 100));
  const portions = Math.ceil(level * foodMaterials.length);
  for (const [index, material] of foodMaterials.entries()) {
    const [r, g, b, alpha] = material.baseColorFactor;
    const visible = Number(index < portions);
    if (alpha !== visible) material.setBaseColorFactor([r, g, b, visible]);
  }
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
  // Position of the skinned muzzle during the first chew, in GLB coordinates.
  const x = 1.947 - target.x;
  const y = -.35 - target.y;
  const z = -1.131 - target.z;
  const forward = x * sinTheta + z * cosTheta;
  const focal = view.height / (2 * Math.tan(viewer.getFieldOfView() * Math.PI / 360));
  const scale = focal / (radius - (forward * sinPhi + y * cosPhi));
  const muzzleX = view.left + view.width / 2 + scale * (x * cosTheta - z * sinTheta);
  const muzzleY = view.top + view.height / 2 -
    scale * (y * sinPhi - forward * cosPhi);
  return [
    room.left + room.width * bowl.centerX / 941 - muzzleX,
    room.top + room.height * (bowl.centerY + 8) / 1672 - muzzleY
  ];
}

function positionFeeding(name, time) {
  if (!care.foodMark) care.foodMark = foodMark();
  const travel = Math.max(0, Math.min(1, (time - feedTurn) / feedWalk));
  const amount = name === 'WalkToBowl' ? travel : name === 'WalkHome' ? 1 - travel : 1;
  const [x, y] = care.foodMark;
  viewer.style.setProperty('translate', `${x * amount}px ${y * amount}px`);
}

function setFeedState(state) {
  care.state = state;
  careDebug(state);
}

function trackFeeding(name, time, duration) {
  positionFeeding(name, time);
  switch (care.state) {
    case 'WalkingToBowl':
      if (time < feedArrival) return false;
      setFeedState('ArrivedAtBowl');
      // The GLB holds this pose through the end of the one-shot clip.
      return time >= duration;
    case 'ArrivedAtBowl':
      return time >= duration;
    case 'Eating': {
      const remaining = 1 - biteEnds.filter(end => time >= end).length / biteEnds.length;
      if (remaining !== foodLevel) setFoodLevel(remaining);
      if (remaining === 0) setFeedState('Finishing');
      return time >= duration;
    }
    case 'Finishing':
    case 'WalkingHome':
      return time >= duration;
    default:
      return false;
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
  house: { room: 'garden',
    clips: ['WalkToHouse', 'EnterHouse', 'RestInside', 'ExitHouse', 'Stretch', 'HouseWalkHome'] },
  drink: { room: 'kitchen', route: [.44, .95, .71, .82],
    clips: ['WalkToWater', 'DrinkWater', 'LickLips', 'DrinkWalkHome'] },
  sleep: { room: 'bedroom', route: [.22, .86, .28, .76],
    clips: Object.keys(sleepStates) },
  play: { room: 'garden', route: [.42, .98, .59, .81],
    clips: ['WalkToBall', 'PushBall', 'ChaseBall', 'PlayHappy', 'PlayWalkHome'] }
};
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

let playbackRequest = 0;
async function play(name) {
  const request = ++playbackRequest;
  const target = viewer;
  clip = name;
  const sleeping = care?.action === 'sleep' && name !== 'Idle';
  const visitingHouse = care?.action === 'house' && name !== 'Idle';
  const feeding = care?.action === 'feed' && name !== 'Idle';
  target.animationCrossfadeDuration = sleeping || visitingHouse || feeding ? 0 : 250;
  // model-viewer uses a projected shadow that can trail the pitching muzzle.
  target.shadowIntensity = name === 'Eat' ? 0 : .7;
  const lawnWalk = visitingHouse && (name === 'WalkToHouse' || name === 'HouseWalkHome');
  const strideVariant = lawnWalk && care.houseStrideCount !== houseStrides
    ? name + care.houseStrideCount : name;
  target.animationName = target.availableAnimations?.includes(strideVariant) ? strideVariant : name;
  wetFur(name === 'BathShake' ? 1 : 0);
  // The renderer applies animationName asynchronously with its default loop mode.
  await target.updateComplete;
  if (request !== playbackRequest || viewer !== target || target.hidden) return;
  const sequenceClip = Boolean(care && name !== 'Idle');
  if (feeding) positionFeeding(name, 0);
  if (visitingHouse) positionAtHouse(name, 0, target.duration);
  if (sequenceClip) target.currentTime = 0;
  target.play(name === 'Idle' || (sequenceClip && !feeding && !sleeping && !visitingHouse) ? {} : { repetitions: 1, pingpong: false });
  if (name === 'Idle' && motionReduced()) target.pause();
  if (care && !(target.duration > 0)) {
    stopCare('Renderer did not select clip ' + name, true);
    return;
  }
  if (sleeping) positionSleeping(name, 0, target.duration);
  if (sequenceClip) {
    careDebug('clip started: ' + name);
    // Non-feed care clips keep the mixer live to preserve their crossfades.
    // Feed uses matching terminal and initial poses and advances at the end
    // of each one-shot, so a previously playing clip cannot pause the next.
    let previousTime = 0;
    let lastProgressAt;
    function blendAtEnd(timestamp) {
      if (request !== playbackRequest || viewer !== target || !care) return;
      const time = target.currentTime;
      // On a slow frame the mixer may wrap past the terminal hold.
      const looped = time < previousTime;
      // Feed clips are one-shots so a delayed frame cannot confuse a wrap
      // with arrival. Respect an explicit pause, including for the food.
      if (feeding) {
        if ((!target.paused || time >= target.duration) &&
            trackFeeding(name, time, target.duration)) {
          advanceCare();
        } else {
          window.requestAnimationFrame(blendAtEnd);
        }
        return;
      }
      if (sleeping) {
        positionSleeping(name, time, target.duration);
        scene.classList.toggle('baby-dreaming', name === 'Sleep' && time >= .65 && time < 3.15);
        if (time >= target.duration) {
          advanceCare();
          return;
        }
        if (target.paused) {
          lastProgressAt = timestamp;
          window.requestAnimationFrame(blendAtEnd);
          return;
        }
      }
      if (visitingHouse) {
        positionAtHouse(name, time, target.duration);
        if (time >= target.duration) {
          advanceCare();
          return;
        }
        if (target.paused) lastProgressAt = timestamp;
      }
      if (name === 'BathWash') wetFur(Math.min(1, time / .65));
      if (name === 'BathShake') wetFur(Math.max(0, Math.min(1, (1.55 - time) / .72)));
      if (!sleeping && !visitingHouse && target.duration > 0 && (time >= target.duration - .36 || looped)) {
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
  const sleeping = care?.action === 'sleep';
  if (care?.action === 'house') {
    if (reason === 'completed' && origin === 'garden') {
      setGardenPoint('garden-rest', care.houseStart.point);
    }
    setGardenHeading(0);
    scene.classList.remove('baby-house-route', 'baby-house-occluded');
    for (const property of ['--house-x', '--house-y', '--house-scale']) {
      scene.style.removeProperty(property);
    }
  }
  if (sleeping) {
    scene.classList.remove('baby-dreaming', 'baby-bed-route', 'baby-on-mattress');
    for (const property of ['--sleep-x', '--sleep-y', '--sleep-scale', '--mattress-load']) {
      scene.style.removeProperty(property);
    }
    careDebug('Idle');
  }
  care = undefined;
  if (meal) {
    careDebug('Idle');
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
  const name = care.clips[index];
  care.state = care.action === 'feed' ? feedStates[name] : sleepStates[name] ??
    (last === 0 ? 'PerformingAction' : index === 0 ? 'Moving' :
      index === last ? 'Returning' : 'PerformingAction');
  careDebug(care.state + ': ' + name);
  play(name).catch(error => stopCare('Playback failed: ' + error.message, true));
}

function startCare() {
  if (!care || care.state !== 'WaitingForRoom' || !ready || viewer.hidden || document.hidden) return;
  if (roomName() !== care.room) return;
  if (care.action === 'feed' && !scene.classList.contains('baby-food-bowl-ready')) return;
  const missing = care.clips.filter(name => !viewer.availableAnimations?.includes(name));
  if (missing.length) return stopCare('Missing clips: ' + missing.join(', '), true);
  if (roomBlocked()) return stopCare('Room is covered by a dialog or decor editor', true);
  if (care.route && !clearCareRoute(care.route)) return stopCare('Decoration in the walking path', true);
  if (care.action === 'house') {
    care.houseStart ??= gardenPose(false);
    const [x, y] = care.houseStart.point;
    const dx = (houseThreshold[0] - x) * 941;
    const dy = (houseThreshold[1] - y) * 1672;
    // A step projects less distance along the receding depth axis.
    care.houseHeading = gardenCamera + Math.atan2(dx, dy / .55) * 180 / Math.PI;
    const distance = Math.hypot(dx, dy / .55);
    const averageScale = (care.houseStart.point[2] + houseThreshold[2]) / 2;
    // Pick the number of complete gait cycles so a longer route gets more
    // steps at the same cadence. Camera depth and scale are in artwork units.
    const cycles = Math.round(distance / (155 * averageScale));
    care.houseStrideCount = Math.max(4, Math.min(11, cycles));
    if (!viewer.availableAnimations.includes('WalkToHouse' + care.houseStrideCount)) {
      care.houseStrideCount = houseStrides;
    }
    if (!clearCareRoute([Math.min(x, houseThreshold[0]) - .05,
      Math.max(x, houseThreshold[0]) + .05, Math.min(y, houseThreshold[1]) - .03,
      Math.max(y, houseThreshold[1]) + .02])) {
      return stopCare('Decoration in the walking path', true);
    }
  }
  if (care.action === 'feed') setFoodLevel(1);
  playCareClip();
}

function advanceCare() {
  careDebug('clip finished: ' + care.clips[care.index]);
  care.index++;
  if (care.index < care.clips.length) return playCareClip();
  const meal = care.action === 'feed' ? care : undefined;
  const sleep = care.action === 'sleep' ? care : undefined;
  stopCare('completed', !meal && !sleep);
  meal?.finishMeal?.();
  sleep?.finishSleep?.();
}

function finished() {
  // Care advances through its frame tracker. Walk and Happy return to Idle
  // directly on the renderer's one-shot completion event.
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
      src: 'assets/models/Jerry_Baby_Animated.glb?v=12',
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
    const edge = document.createElement('div');
    edge.id = 'babyBedEdge';
    edge.setAttribute('aria-hidden', 'true');
    const pressure = document.createElement('div');
    pressure.id = 'babyMattressPressure';
    pressure.setAttribute('aria-hidden', 'true');
    const dreams = document.createElement('span');
    dreams.id = 'babySleepDreams';
    dreams.setAttribute('aria-hidden', 'true');
    dreams.textContent = 'Zzz';
    const houseFacade = document.createElement('div');
    houseFacade.id = 'babyHouseFacade';
    houseFacade.setAttribute('aria-hidden', 'true');
    scene.prepend(edge, pressure, dreams, houseFacade);
  }
  if (viewer) {
    const room = roomName();
    const changed = viewer.hidden === show || currentRoom !== room;
    if (currentRoom === 'garden' && room !== 'garden') {
      for (const axis of ['x', 'y', 'scale']) scene.style.removeProperty('--garden-rest-' + axis);
    }
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
  const { action, finishMeal, finishSleep } = event.detail;
  const origin = roomName();
  if (scene.dataset.growthStage !== 'Baby' || !origin) return;
  const config = Object.hasOwn(careActions, action) ? careActions[action] :
    action === 'dress-show' ? { room: origin, clips: ['DressTurn'] } : undefined;
  if (!config && action !== 'touch') return;
  if ((finishMeal || finishSleep) && care) event.preventDefault();
  if (failed || care || viewer?.hidden || motionReduced() || (action === 'feed' && foodFailed)) {
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
  if (finishMeal || finishSleep) event.preventDefault();
  clearTimeout(walkTimer);
  care = { ...config, action, origin, finishMeal, finishSleep, index: 0, state: 'WaitingForRoom' };
  if (action === 'house' && origin === 'garden' && ready) {
    care.houseStart = gardenPose(true);
  }
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
