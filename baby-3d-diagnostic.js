/* Temporary, read-only mobile diagnostic for Baby 3D loading. */
(() => {
  'use strict';
  const box = document.createElement('div');
  box.id = 'baby3dDiagnostic';
  box.setAttribute('role', 'status');
  box.style.cssText = 'margin:8px 5px;padding:8px 10px;background:#fff8db;border:1px solid #d9ad59;border-radius:10px;font:12px/1.45 system-ui;color:#63300e;overflow-wrap:anywhere';
  const entries = [];
  window.addEventListener('baby-care-debug', event => record('care: ' + event.detail));
  const record = (message) => {
    const value = String(message).slice(0,180);
    if (entries.at(-1) !== value) entries.push(value);
    if (entries.length > 7) entries.shift();
    render();
  };
  function render() {
    const viewer = document.getElementById('jerryBaby3D');
    const scene = document.getElementById('scene');
    const stage = scene?.dataset.growthStage || 'unknown';
    const registered = !!customElements.get('model-viewer');
    const loaded = !!viewer?.loaded;
    const animations = viewer?.availableAnimations?.length || 0;
    const ready = !!scene?.classList.contains('jerry-baby-3d-ready');
    box.textContent = 'Baby 3D diagnostic | stage: ' + stage +
      ' | renderer: ' + (registered ? 'registered' : 'missing') +
      ' | viewer: ' + (viewer ? 'present' : 'missing') +
      ' | loaded: ' + loaded + ' | clips: ' + animations +
      ' | ready: ' + ready + (entries.length ? ' | events: ' + entries.join(' / ') : '');
  }
  const nav = document.getElementById('roomNav');
  if (nav) nav.after(box);
  window.addEventListener('error', event => {
    const source = event.filename ? event.filename.split('/').pop() : '';
    if (/model-viewer|jerry-baby|\.glb/i.test(source + ' ' + event.message)) {
      record('script error: ' + event.message);
    }
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = String(event.reason?.message || event.reason || 'unknown');
    if (/model|gltf|glb|webgl|animation|shader/i.test(reason)) record('rejection: ' + reason);
  });
  document.addEventListener('error', event => {
    const el = event.target;
    if (el?.tagName === 'SCRIPT' && /model-viewer|jerry-baby/.test(el.src || '')) record('script resource failed: ' + el.src.split('/').pop());
  }, true);
  const observer = new MutationObserver(() => {
    const viewer = document.getElementById('jerryBaby3D');
    if (viewer && !viewer.dataset.diagnosticAttached) {
      viewer.dataset.diagnosticAttached = 'yes';
      viewer.addEventListener('load', () => record('model load event'));
      viewer.addEventListener('error', event => record('model error: ' + (event.detail?.type || 'unknown')));
    }
    render();
  });
  observer.observe(document.getElementById('scene'), {childList:true, attributes:true, attributeFilter:['class','data-growth-stage']});
  setInterval(render, 2000);
  setTimeout(() => record('10s checkpoint'), 10000);
  render();
})();
