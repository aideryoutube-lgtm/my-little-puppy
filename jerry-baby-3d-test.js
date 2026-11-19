'use strict';

const viewer = document.getElementById('jerry');
const status = document.getElementById('status');
const controls = document.querySelectorAll('[data-zoom]');
const asset = '/assets/models/jerry_puppy_25k_tris.glb';
let phase = 'Loading the 3D viewer';

const timeout = setTimeout(() => fail(phase + ' timed out. Reload to try again.'), 30000);

function report(state, message) {
  status.dataset.state = state;
  status.textContent = message;
  for (const button of controls) button.disabled = state !== 'ready';
}

function fail(message) {
  clearTimeout(timeout);
  report('error', message);
}

async function loadJerry() {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) throw new Error('WebGL 2 is unavailable in this browser.');
    context.getExtension('WEBGL_lose_context')?.loseContext();

    await import('/assets/vendor/model-viewer-4.1.0.min.js');
    if (!customElements.get('model-viewer')) throw new Error('The 3D viewer did not initialize.');
    phase = 'Loading the Jerry Baby GLB';
    report('loading', phase + '…');
    viewer.addEventListener('progress', ({ detail }) => {
      if (status.dataset.state === 'loading') {
        report('loading', phase + '… ' + Math.round(detail.totalProgress * 100) + '%');
      }
    });
    viewer.addEventListener('load', () => {
      clearTimeout(timeout);
      viewer.dismissPoster();
      report('ready', 'Jerry Baby loaded · WebGL 2');
    });
    viewer.addEventListener('error', ({ detail }) => {
      const message = detail?.sourceError?.message || detail?.type || 'unknown error';
      fail('Could not display Jerry Baby: ' + message);
    });
    viewer.src = asset;
  } catch (error) {
    fail(error.message);
  }
}

for (const button of controls) {
  button.addEventListener('click', () => viewer.zoom(button.dataset.zoom === 'in' ? 1 : -1));
}
loadJerry();
