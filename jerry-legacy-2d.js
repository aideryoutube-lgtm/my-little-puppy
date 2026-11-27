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
  const bathroomActions = [
    ['Bath', '🛁'],
    ['Bubbles', '🫧', 'Jerry_Puppy_Bathroom_Bubbles.mp4'],
    ['Brush', '🪮', 'Jerry_Puppy_Bathroom_Brush.mp4'],
    ['Dry', '💨', 'Jerry_Puppy_Bathroom_Dry.mp4'],
    ['Mirror', '🪞', 'Jerry_Puppy_Bathroom_Mirror.mp4']
  ];
  const standardActions = document.querySelector('.scene-actions');
  const buttons = standardActions.querySelectorAll('button');
  const bathroomPanel = document.createElement('nav');
  bathroomPanel.id = 'bathroom2dActions';
  bathroomPanel.className = 'scene-actions';
  bathroomPanel.setAttribute('aria-label', 'Bathroom actions');
  bathroomPanel.hidden = true;
  const babyRoomFiles = {
    kitchen: {
      feed: 'Baby_Feed_Kitchen_4s.mp4',
      drink: 'Baby_Drink_Kitchen_4s_DeepCrop.mp4',
      snack: 'Baby_Snack_Kitchen_4s_DeepCrop.mp4',
      cookie: 'Baby_Cookie_Kitchen_4s.mp4'
    },
    bathroom: {
      bath: 'Baby_Bath_Bathroom_4s.mp4',
      bubbles: 'Baby_Bubbles_Bathroom_4s.mp4',
      brush: 'Baby_Brush_Bathroom_4s.mp4',
      dry: 'Baby_Dry_Bathroom_4s.mp4',
      mirror: 'Baby_Mirror_Bathroom_4s.mp4'
    },
    garden: {
      house: 'Baby_House_Garden_4s.mp4',
      run: 'Baby_Run_Garden_4s.mp4',
      fetch: 'Baby_Ball_Garden_4s.mp4'
    },
    bedroom: {
      sleep: 'Baby_Sleep_Bedroom_4s.mp4',
      play: 'Baby_Play_Bedroom_4s.mp4',
      dress: 'Baby_Dress_Bedroom_4s.mp4',
      jump: 'Baby_Jump_Bedroom_4s.mp4',
      cuddle: 'Baby_Cuddle_Bedroom_4s.mp4'
    }
  };
  const puppyRoomFiles = {
    bathroom: { bath: 'Puppy_Bath_Bathroom_4s.mp4' },
    bedroom: { sleep: 'Puppy_Sleep_Bedroom_4s.mp4', play: 'Puppy_Play_Bedroom_4s.mp4' }
  };
  for (const [label, icon, file] of bathroomActions) {
    const action = label.toLowerCase();
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    const symbol = document.createElement('span');
    symbol.className = 'action-icon';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = icon;
    button.append(symbol);
    bathroomPanel.append(button);
    if (file) puppyRoomFiles.bathroom[action] = file;
    button.addEventListener('click', () => {
      if (bathroomPanel.hidden || button.disabled) return;
      if (scene.dataset.growthStage === 'Baby' && file && babyRoomFiles.bathroom[action]) {
        window.pawtopiaWorld.playBathroomActivity(action);
      } else if (file) window.pawtopiaJerryVideo.play(action);
      else document.getElementById('bath').click();
    });
  }
  standardActions.after(bathroomPanel);
  // Slot IDs stay room-specific. Set file when the matching clip is shipped.
  const puppyActions = {
    bedroom: [
      { control: 'sleep' },
      { control: 'ball' },
      { id: 'puppy-bedroom-dress', label: 'Dress', icon: '👕', file: 'Puppy_Dress_Bedroom_4s_DeepCrop.mp4' },
      { id: 'puppy-bedroom-jump', label: 'Jump', icon: '⬆️', file: 'Puppy_Jump_Bedroom_4s_DeepCrop.mp4' },
      { id: 'puppy-bedroom-cuddle', label: 'Cuddle', icon: '🤗', file: 'Puppy_Cuddle_Bedroom_4s.mp4' }
    ],
    kitchen: [
      { id: 'puppy-kitchen-feed', label: 'Feed', icon: '🍖', file: 'Puppy_Feed_Kitchen_4s_Cropped.mp4' },
      { id: 'puppy-kitchen-drink', label: 'Drink', icon: '💧', file: 'Puppy_Drink_Kitchen_4s_DeepCrop.mp4' },
      { id: 'puppy-kitchen-treat', label: 'Treat', icon: '🦴', file: 'Puppy_Treat_Kitchen_4s_DeepCrop.mp4' },
      { id: 'puppy-kitchen-cook', label: 'Cook', icon: '🍳', file: 'Puppy_Cook_Kitchen_4s_DeepCrop.mp4' },
      { id: 'puppy-kitchen-cookie', label: 'Cookie', icon: '🍪', unavailable: true },
      { id: 'puppy-kitchen-snack', label: 'Snack', icon: '🥕', file: null }
    ],
    garden: [
      { id: 'puppy-garden-house', label: 'House', icon: '🏠', file: null },
      { id: 'puppy-garden-run', label: 'Run', icon: '💨', file: null },
      { id: 'puppy-garden-fetch', label: 'Fetch', icon: '🎾', file: null },
      { id: 'puppy-garden-dig', label: 'Dig', icon: '🐾', file: null },
      { id: 'puppy-garden-explore', label: 'Explore', icon: '🔎', file: null }
    ]
  };
  const roomPanels = { Baby: {}, Puppy: {}, Adult: {} };
  const babyActions = {};
  for (const [room, actions] of Object.entries(puppyActions)) {
    babyActions[room] = actions.map(action => {
      if (action.control === 'sleep') return action;
      const name = action.control === 'ball' ? 'play' : action.label.toLowerCase();
      return {
        ...action,
        ...(room === 'garden' && name === 'fetch' ? { label: 'Ball' } : {}),
        ...(room === 'garden' && name === 'dig' ? { label: 'Walk' } : {}),
        ...(name === 'feed' ? { control: 'food' } : {}),
        id: 'baby-' + room + '-' + name,
        name,
        unavailable: false,
        file: babyRoomFiles[room]?.[name]
      };
    });
  }
  const adultActions = {
    kitchen: [
      ...Array.from(buttons, button => ({ control: button.id })),
      { id: 'adult-kitchen-cookie', label: 'Cookie', icon: '🍪', unavailable: true },
      { id: 'adult-kitchen-snack', label: 'Snack', icon: '🥕', unavailable: true }
    ]
  };

  for (const [stage, rooms] of Object.entries({ Baby: babyActions, Puppy: puppyActions, Adult: adultActions })) {
    for (const [room, actions] of Object.entries(rooms)) {
      const panel = document.createElement('nav');
      panel.className = 'scene-actions';
      panel.dataset[stage.toLowerCase() + '2dRoom'] = room;
      panel.setAttribute('aria-label', room[0].toUpperCase() + room.slice(1) + ' actions');
      panel.hidden = true;
      for (const action of actions) {
        const original = action.control && document.getElementById(action.control);
        const button = original ? original.cloneNode(true) : document.createElement('button');
        button.removeAttribute('id');
        if (action.id) button.id = action.id;
        if (!original) {
          button.type = 'button';
          button.setAttribute('aria-label', action.label);
          const symbol = document.createElement('span');
          symbol.className = 'action-icon';
          symbol.setAttribute('aria-hidden', 'true');
          symbol.textContent = action.icon;
          button.append(symbol);
        }
        if (room === 'kitchen' && button.getAttribute('aria-label') === 'Feed') {
          const bowl = document.createElement('img');
          bowl.src = 'assets/rooms/kitchen-water-bowl.svg';
          bowl.alt = '';
          bowl.width = 28;
          bowl.height = 23;
          button.replaceChildren(bowl);
        }
        if (action.unavailable) button.dataset.unavailable = '';
        if (stage === 'Adult' && action.control === 'home') button.dataset.adultHouse = '';
        button.addEventListener('click', () => {
          if (panel.hidden || button.disabled) return;
          if (original && (!action.name || action.file)) original.click();
          else if (stage === 'Baby' && room === 'bedroom' && (action.name === 'jump' || action.name === 'cuddle')) {
            window.pawtopiaWorld.playBedroomActivity(action.id);
          } else window.pawtopiaJerryVideo.play(action.id);
        });
        panel.append(button);
      }
      bathroomPanel.after(panel);
      roomPanels[stage][room] = panel;
    }
  }
  let active;

  function context() {
    return [scene.dataset.growthStage, window.pawtopiaWorld.snapshot().world.room];
  }

  function renderActions() {
    const [stage, room] = context();
    const is2d = window.pawtopiaJerryMode === '2d';
    const visible = is2d && room === 'bathroom';
    const puppy = stage === 'Puppy';
    const roomPanel = is2d ? roomPanels[stage]?.[room] : undefined;
    if (status.textContent === 'Coming soon'
        && !(roomPanel && !roomPanel.hidden)
        && !(visible && stage === 'Baby' && !bathroomPanel.hidden)) status.hidden = true;
    standardActions.hidden = visible || Boolean(roomPanel);
    bathroomPanel.hidden = !visible;
    if (roomPanel === roomPanels.Adult.kitchen) {
      const { hasHome } = window.pawtopiaWorld.snapshot();
      roomPanel.querySelector('[data-adult-house]').setAttribute('aria-label', hasHome ? 'House — owned' : 'House');
    }
    for (const panels of Object.values(roomPanels)) {
      for (const panel of Object.values(panels)) {
        panel.hidden = panel !== roomPanel;
        for (const button of panel.children) {
          button.disabled = Boolean(active) || button.hasAttribute('data-unavailable');
        }
      }
    }
    for (const [index, button] of Array.from(bathroomPanel.children).entries()) {
      button.disabled = Boolean(active) || (Boolean(bathroomActions[index][2]) && !puppy && stage !== 'Baby');
    }
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
    renderActions();
    if (outcome === 'error') {
      status.textContent = 'Jerry’s ' + request.stage + ' ' + request.action + ' video could not play.';
      status.hidden = false;
    }
    if (outcome === 'completed' || (outcome === 'error' && !request.babyRoomFile)) request.complete?.();
  }

  window.pawtopiaJerryVideo = {
    play(action, complete) {
      if (active) return true;
      if (action === 'dress-show') return false;
      if (action === 'care') action = 'bath';
      const [stage, room] = context();
      const is2d = window.pawtopiaJerryMode === '2d';
      const puppy2d = is2d && stage === 'Puppy';
      const baby2d = is2d && stage === 'Baby';
      const slot = puppy2d ? puppyActions[room]?.find(entry => entry.id === action) : undefined;
      const babySlot = baby2d ? babyActions[room]?.find(entry => entry.id === action) : undefined;
      if (slot?.unavailable) return true;
      if ((slot && !slot.file) || (babySlot && !babySlot.file)) {
        status.textContent = 'Coming soon';
        status.hidden = false;
        return true;
      }
      const puppyRoomFile = puppy2d ? slot?.file || puppyRoomFiles[room]?.[action] : undefined;
      const babyRoomFile = baby2d ? babySlot?.file || babyRoomFiles[room]?.[action] : undefined;
      const file = babyRoomFile || puppyRoomFile || videos[stage]?.[action];
      if (babySlot?.name === 'drink' || babySlot?.name === 'cookie') {
        const type = babySlot.name === 'drink' ? 'water' : 'cookie';
        complete = () => {
          const result = window.pawtopiaWorld.commit(type);
          document.getElementById('worldMessage').textContent = result.message;
        };
      }
      status.hidden = true;
      if (!file) {
        status.textContent = 'No ' + action + ' video is available for Jerry’s ' + stage + ' stage.';
        status.hidden = false;
        return false;
      }
      const video = document.createElement('video');
      const request = { video, stage, room, action, complete, babyRoomFile };
      active = request;
      scene.setAttribute('data-care-busy', '');
      buttons.forEach(button => { button.disabled = true; });
      renderActions();
      video.id = 'jerryLegacyClip';
      video.playsInline = true;
      video.muted = !slot && !babyRoomFile;
      if (slot) video.classList.add('puppy-room-action-clip');
      if (babyRoomFile && room === 'bedroom' && action !== 'sleep') {
        video.classList.add('baby-bedroom-action-clip');
      }
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
      const folder = (!puppyRoomFile && !babyRoomFile && silent[stage]?.includes(action) ? 'silent/' : '') + stage.toLowerCase();
      const source = 'assets/videos/' + folder + '/' + file;
      layer.append(video);
      request.timer = setTimeout(() => finish(request, 'error'), 15000);
      function start(url) {
        video.src = url;
        video.play()?.catch(() => finish(request, 'error'));
      }
      if ((puppyRoomFile && !slot) || (stage === 'Baby' && action === 'dress')) {
        // WebKit can stall on these HTTP streams. Play their original bytes from memory.
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
  document.addEventListener('pawtopia-jerry-mode-change', () => {
    cancel();
    renderActions();
  });
  document.addEventListener('pawtopia-restored', cancel);
  window.addEventListener('pagehide', cancel);
  document.addEventListener('pawtopia-state', () => {
    if (active) {
      const [stage, room] = context();
      if (stage !== active.stage || room !== active.room) cancel();
    }
    renderActions();
  });
  // The mode switch is initialized by the following inline script.
  document.addEventListener('DOMContentLoaded', renderActions, {once:true});
})();
