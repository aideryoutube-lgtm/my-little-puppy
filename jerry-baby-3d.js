// Reuse the local model-viewer renderer and keep the original Baby image as a fallback.
const scene = document.getElementById('scene');
const canvas = document.getElementById('roomCanvas');
let viewer;
let ready = false;
let failed = false;
let clip = '';
let walkTimer;
let currentRoom = '';
let pendingFeed = false;
let feeding = false;
let returnRoom;
const feedNext = { WalkToBowl: 'Eat', Eat: 'WalkHome' };
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

let playbackRequest = 0;
async function play(name) {
  const request = ++playbackRequest;
  const target = viewer;
  clip = name;
  target.animationName = name;
  // The renderer applies animationName asynchronously with its default loop mode.
  await target.updateComplete;
  if (request !== playbackRequest || viewer !== target || target.hidden || document.hidden) return;
  const feedClip = feeding && name !== 'Idle';
  if (feedClip) target.currentTime = 0;
  target.play(name === 'Idle' || feedClip ? {} : { repetitions: 1, pingpong: false });
  if (name === 'Idle' && motionReduced()) target.pause();
  if (feedClip) {
    // Hold each end pose in the GLB and transition while the mixer is live.
    // A one-shot finished event pauses model-viewer before it can crossfade.
    let previousTime = 0;
    function blendAtEnd() {
      if (request !== playbackRequest || viewer !== target || !feeding) return;
      const time = target.currentTime;
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

function clearFeedRoute() {
  const room = canvas.getBoundingClientRect();
  return clearFloor(room.left + room.width * .35, room.left + room.width * .91,
    room.top + room.height * .61, room.top + room.height * .77);
}

function cancelFeed() {
  pendingFeed = false;
  feeding = false;
  returnRoom = undefined;
}

function startFeed() {
  if (!pendingFeed || !ready || viewer.hidden || document.hidden || clip !== 'Idle') return;
  pendingFeed = false;
  if (motionReduced() || roomBlocked() || !viewer.availableAnimations?.includes('Eat')) return;
  const origin = currentRoom;
  if (origin !== 'room-kitchen') {
    if (!origin || !window.pawtopiaWorld?.commit('room', 'kitchen').ok) return;
    returnRoom = origin.slice('room-'.length);
  }
  // Read the authored floor area after the kitchen and its decor are rendered.
  if (!clearFeedRoute()) {
    if (returnRoom) window.pawtopiaWorld.commit('room', returnRoom);
    cancelFeed();
    return;
  }
  clearTimeout(walkTimer);
  feeding = true;
  play('WalkToBowl');
}

function finished() {
  if (feeding && feedNext[clip]) {
    play(feedNext[clip]);
    return;
  }
  if (feeding && clip === 'WalkHome') {
    const origin = returnRoom;
    cancelFeed();
    if (origin) window.pawtopiaWorld.commit('room', origin);
  }
  if (clip !== 'Idle') idle();
}

function idle() {
  clearTimeout(walkTimer);
  play('Idle');
  startFeed();
  if (feeding || motionReduced()) return;
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
      src: 'assets/models/Jerry_Baby_Animated.glb?v=3',
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
      cancelFeed();
      viewer.remove();
      viewer = undefined;
      sync();
    });
    scene.prepend(viewer);
  }
  if (viewer) {
    const room = [...canvas.classList].find(name => /^room-(living|kitchen|bedroom|bathroom|garden)$/.test(name));
    const changed = viewer.hidden === show || currentRoom !== room;
    // The Feed request itself may switch rooms before MutationObserver runs.
    const enteringKitchen = feeding && returnRoom && room === 'room-kitchen';
    currentRoom = room;
    viewer.hidden = !show;
    if (ready && clip && changed && !(show && enteringKitchen)) {
      cancelFeed();
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
  if (event.detail.action === 'feed' && scene.dataset.growthStage === 'Baby') {
    if (failed || feeding || motionReduced()) return;
    pendingFeed = true;
    startFeed();
    return;
  }
  if (event.detail.action !== 'touch' || !ready || viewer.hidden || !clip ||
      feeding || clip === 'Happy' || motionReduced()) return;
  clearTimeout(walkTimer);
  play('Happy');
});

function syncMotion() {
  if (ready && viewer && !viewer.hidden && clip) {
    cancelFeed();
    idle();
  }
}
reducedMotion?.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', () => {
  if (!ready || !viewer || viewer.hidden || !clip) return;
  if (document.hidden) {
    cancelFeed();
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
