// Reuse the local model-viewer renderer and keep the original Baby image as a fallback.
const scene = document.getElementById('scene');
const canvas = document.getElementById('roomCanvas');
let viewer;
let ready = false;
let failed = false;

function sync() {
  const isBaby = scene.dataset.growthStage === 'Baby';
  const show = isBaby && !canvas.classList.contains('jerry-3d-ready') &&
    !scene.classList.contains('video-ready');
  if (show && !viewer && !failed) {
    viewer = document.createElement('model-viewer');
    viewer.id = 'jerryBaby3D';
    viewer.setAttribute('aria-hidden', 'true'); // The existing Pet Jerry control handles interaction.
    for (const [name, value] of Object.entries({
      src: 'assets/models/Jerry_Baby.glb',
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
    });
    viewer.addEventListener('error', () => {
      failed = true;
      ready = false;
      viewer.remove();
      viewer = undefined;
      sync();
    });
    scene.prepend(viewer);
  }
  if (viewer) viewer.hidden = !show;
  scene.classList.toggle('jerry-baby-3d-ready', show && ready);
}

const observer = new MutationObserver(sync);
observer.observe(scene, { attributes: true, attributeFilter: ['class', 'data-growth-stage'] });
observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
sync();
