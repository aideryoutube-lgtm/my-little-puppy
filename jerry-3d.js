/* The Puppy GLB is static until stage-specific animation clips are available. */
(() => {
  'use strict';
  const scene = document.getElementById('scene');
  const status = document.getElementById('jerryActionStatus');
  let viewer;
  let loaded = false;
  let failed = false;

  function sync() {
    const show = window.pawtopiaJerryMode !== '2d' && scene.dataset.growthStage === 'Puppy';
    if (show && !viewer) {
      viewer = document.createElement('model-viewer');
      viewer.id = 'jerry3D';
      viewer.alt = 'Jerry Puppy';
      viewer.setAttribute('camera-orbit', '0deg 75deg 105%');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('loading', 'eager');
      viewer.addEventListener('load', () => { loaded = true; failed = false; sync(); });
      viewer.addEventListener('error', () => { loaded = false; failed = true; sync(); });
      viewer.setAttribute('src', 'assets/models/Jerry_Puppy.glb');
      scene.prepend(viewer);
    }
    if (viewer) viewer.hidden = !show;
    scene.classList.toggle('jerry-3d-ready', show && loaded);
    if (show && failed) {
      status.textContent = 'The Puppy 3D model could not load.';
      status.hidden = false;
    }
  }

  scene.addEventListener('pawtopia-jerry-action', event => {
    if (window.pawtopiaJerryMode === '2d') return;
    const stage = scene.dataset.growthStage;
    if (stage === 'Baby') return;
    const action = event.detail.action === 'care' ? 'bath' : event.detail.action;
    status.textContent = stage === 'Puppy' && !failed
      ? 'No Puppy 3D animation is available for ' + action + '.'
      : 'The ' + stage + ' 3D model is unavailable.';
    status.hidden = false;
  });
  new MutationObserver(records => {
    if (records.some(record => record.oldValue !== scene.dataset.growthStage)) {
      status.hidden = true;
      sync();
    }
  }).observe(scene, {attributes:true, attributeOldValue:true, attributeFilter:['data-growth-stage']});
  document.addEventListener('pawtopia-jerry-mode-change', sync);
  // The inline mode selector runs later in the same document.
  document.addEventListener('DOMContentLoaded', sync, {once:true});
})();
