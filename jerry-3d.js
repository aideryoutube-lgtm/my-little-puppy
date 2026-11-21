/* Puppy and Adult use static models until their own animation clips are available. */
(() => {
  'use strict';
  const scene = document.getElementById('scene');
  const status = document.getElementById('jerryActionStatus');
  const models = {
    Puppy: { src: 'assets/models/Jerry_Puppy.glb?v=2', orbit: '0deg 75deg 105%' },
    Adult: { src: 'assets/models/Jerry_Adult.glb', orbit: '0deg 75deg 105%' }
  };
  let viewer;
  let viewerStage;
  let loaded = false;
  let failed = false;

  function sync() {
    const stage = scene.dataset.growthStage;
    const model = models[stage];
    const show = window.pawtopiaJerryMode !== '2d' && Boolean(model);
    if (viewer && viewerStage !== stage) {
      viewer.remove();
      viewer = undefined;
      loaded = false;
      failed = false;
    }
    if (show && !viewer) {
      const current = document.createElement('model-viewer');
      viewer = current;
      viewerStage = stage;
      viewer.id = 'jerry3D';
      viewer.alt = 'Jerry ' + stage;
      viewer.setAttribute('camera-orbit', model.orbit);
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('disable-tap', '');
      viewer.addEventListener('click', () => {
        if (current === viewer && !current.hidden && loaded) window.pawtopiaWorld.action('touch');
      });
      viewer.addEventListener('load', () => {
        if (current !== viewer) return;
        loaded = true;
        failed = false;
        sync();
      });
      viewer.addEventListener('error', () => {
        if (current !== viewer) return;
        loaded = false;
        failed = true;
        sync();
      });
      viewer.setAttribute('src', model.src);
      scene.prepend(viewer);
    }
    if (viewer) viewer.hidden = !show;
    scene.classList.toggle('jerry-3d-ready', show && loaded);
    if (show && failed) {
      status.textContent = 'The ' + stage + ' 3D model could not load.';
      status.hidden = false;
    }
  }

  scene.addEventListener('pawtopia-jerry-action', event => {
    if (window.pawtopiaJerryMode === '2d') return;
    const stage = scene.dataset.growthStage;
    if (stage === 'Baby') return;
    const action = event.detail.action === 'care' ? 'bath' : event.detail.action;
    status.textContent = models[stage] && !failed
      ? 'No ' + stage + ' 3D animation is available for ' + action + '.'
      : 'The ' + stage + ' 3D model is unavailable.';
    status.hidden = false;
  });
  new MutationObserver(records => {
    if (records.some(record => record.oldValue !== scene.dataset.growthStage)) {
      status.hidden = true;
      sync();
    }
  }).observe(scene, {attributes:true, attributeOldValue:true, attributeFilter:['data-growth-stage']});
  document.addEventListener('pawtopia-jerry-mode-change', () => {
    status.hidden = true;
    sync();
  });
  // The inline mode selector runs later in the same document.
  document.addEventListener('DOMContentLoaded', sync, {once:true});
})();
