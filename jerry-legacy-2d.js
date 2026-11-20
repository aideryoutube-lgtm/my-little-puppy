/* Stage-specific video playback. The shared action handlers own all rewards. */
(() => {
  'use strict';
  const scene = document.getElementById('scene');
  const layer = document.getElementById('jerryVideoLayer');
  const status = document.getElementById('jerryActionStatus');
  const videos = {
    Baby: {feed:'Jerry_Baby_Feed_4s.mp4',sleep:'Jerry_Baby_Sleep_4s.mp4',play:'Jerry_Baby_Play_4s.mp4',bath:'Jerry_Baby_Bath.mp4',house:'Jerry_Baby_House_4s.mp4',touch:'Jerry_Baby_Touch_Happy.mp4',dress:'Jerry_Baby_Dress.mp4'},
    Puppy: {feed:'Jerry_Puppy_Feed.mp4',sleep:'Jerry_Puppy_Sleep.mp4',play:'Jerry_Puppy_Play.mp4',bath:'Jerry_Puppy_Bath.mp4',house:'Jerry_Puppy_House_02.mp4',touch:'Jerry_Puppy_Touch_Happy.mp4',dress:'Jerry_Puppy_Dress.mp4'},
    Adult: {feed:'Jerry_Adult_Feed.mp4',sleep:'Jerry_Adult_Sleep.mp4',play:'Jerry_Adult_Play.mp4',bath:'Jerry_Adult_Bath.mp4',house:'Jerry_Adult_House.mp4',touch:'Jerry_Adult_Touch_Happy.mp4',dress:'Jerry_Adult_Dress.mp4'}
  };
  // Use silent copies of these clips so playback does not depend on audio decoding.
  const silent = { Baby: ['sleep', 'bath', 'touch'], Puppy: ['feed', 'house', 'sleep', 'bath', 'touch'] };
  const buttons = document.querySelectorAll('.scene-actions button');
  let active;

  function context() {
    return [scene.dataset.growthStage, window.pawtopiaWorld.snapshot().world.room];
  }

  function finish(request, outcome) {
    if (!request || active !== request) return;
    active = undefined;
    clearTimeout(request.timer);
    request.video.pause();
    request.video.remove();
    request.video.removeAttribute('src');
    request.video.load();
    request.download?.abort();
    if (request.objectURL) URL.revokeObjectURL(request.objectURL);
    layer.classList.remove('is-playing');
    scene.removeAttribute('data-care-busy');
    buttons.forEach(button => { button.disabled = false; });
    if (outcome === 'error') {
      status.textContent = 'Jerry’s ' + request.stage + ' ' + request.action + ' video could not play.';
      status.hidden = false;
    }
    if (outcome !== 'cancelled') request.complete?.();
  }

  window.pawtopiaJerryVideo = {
    play(action, complete) {
      if (active) return true;
      if (action === 'dress-show') return false;
      if (action === 'care') action = 'bath';
      const [stage, room] = context();
      const file = videos[stage]?.[action];
      status.hidden = true;
      if (!file) {
        status.textContent = 'No ' + action + ' video is available for Jerry’s ' + stage + ' stage.';
        status.hidden = false;
        return false;
      }
      const video = document.createElement('video');
      const request = { video, stage, room, action, complete };
      active = request;
      scene.setAttribute('data-care-busy', '');
      buttons.forEach(button => { button.disabled = true; });
      video.id = 'jerryLegacyClip';
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('aria-label', 'Jerry: ' + action);
      const reveal = () => {
        if (active === request) layer.classList.add('is-playing');
      };
      video.addEventListener('playing', () => {
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
        else reveal();
      }, {once:true});
      video.addEventListener('ended', () => finish(request, 'completed'), {once:true});
      video.addEventListener('error', () => finish(request, 'error'), {once:true});
      const folder = (silent[stage]?.includes(action) ? 'silent/' : '') + stage.toLowerCase();
      const source = 'assets/videos/' + folder + '/' + file;
      layer.append(video);
      request.timer = setTimeout(() => finish(request, 'error'), 15000);
      function start(url) {
        video.src = url;
        video.play()?.catch(() => finish(request, 'error'));
      }
      if (stage === 'Baby' && action === 'dress') {
        // WebKit can stall on the original clip's HTTP stream even when
        // buffered. Play the same bytes from memory instead.
        request.download = new AbortController();
        fetch(source, { signal: request.download.signal }).then(response => {
          if (!response.ok) throw new Error('Video download failed');
          return response.blob();
        }).then(blob => {
          if (active !== request) return;
          request.objectURL = URL.createObjectURL(blob);
          start(request.objectURL);
        }).catch(() => finish(request, 'error'));
      } else start(source);
      return true;
    }
  };

  function cancel() { finish(active, 'cancelled'); }
  document.addEventListener('pawtopia-jerry-mode-change', cancel);
  document.addEventListener('pawtopia-restored', cancel);
  window.addEventListener('pagehide', cancel);
  document.addEventListener('pawtopia-state', () => {
    if (!active) return;
    const [stage, room] = context();
    if (stage !== active.stage || room !== active.room) cancel();
  });
})();
