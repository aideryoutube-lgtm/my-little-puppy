// Reuse the local model-viewer renderer and keep the original Baby image as a fallback.
const scene = document.getElementById('scene');
const canvas = document.getElementById('roomCanvas');
let viewer;
let ready = false;
let failed = false;
let clip = '';
let walkTimer;
let currentRoom = '';
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
  target.play(name === 'Idle' ? {} : { repetitions: 1, pingpong: false });
  if (name === 'Idle' && motionReduced()) target.pause();
}

function motionReduced() {
  return reducedMotion?.matches || document.documentElement.dataset.effects === 'minimal';
}

function canWalk() {
  if (scene.classList.contains('decor-editing') || canvas.closest('.decor-editing') ||
      !document.getElementById('worldOverlay')?.hidden ||
      !document.getElementById('miniOverlay')?.hidden) return false;
  const box = viewer.getBoundingClientRect();
  const floor = box.top + box.height * .804;
  // Stay on the existing clear floor patch and yield it to placed decorations.
  return !Array.from(canvas.querySelectorAll('.room-decoration')).some(item => {
    const decor = item.getBoundingClientRect();
    return decor.right > box.left + box.width * .20 &&
      decor.left < box.right - box.width * .15 &&
      decor.bottom > floor - box.height * .38 && decor.top < floor + box.height * .20;
  });
}

function idle() {
  clearTimeout(walkTimer);
  play('Idle');
  if (motionReduced()) return;
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
      src: 'assets/models/Jerry_Baby_Animated.glb',
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
      if (viewer.availableAnimations?.includes('Idle')) idle();
      sync();
    });
    viewer.addEventListener('finished', () => {
      if (clip !== 'Idle') idle();
    });
    viewer.addEventListener('error', () => {
      clearTimeout(walkTimer);
      failed = true;
      ready = false;
      viewer.remove();
      viewer = undefined;
      sync();
    });
    scene.prepend(viewer);
  }
  if (viewer) {
    const room = [...canvas.classList].find(name => /^room-(living|kitchen|bedroom|bathroom|garden)$/.test(name));
    const changed = viewer.hidden === show || currentRoom !== room;
    currentRoom = room;
    viewer.hidden = !show;
    if (ready && clip && changed) {
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
  if (event.detail.action !== 'touch' || !ready || viewer.hidden || !clip ||
      clip === 'Happy' || motionReduced()) return;
  clearTimeout(walkTimer);
  play('Happy');
});

function syncMotion() {
  if (ready && viewer && !viewer.hidden && clip) idle();
}
reducedMotion?.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', () => {
  if (!ready || !viewer || viewer.hidden || !clip) return;
  if (document.hidden) {
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
