/* Legacy 2D Jerry clips: visual playback only; game state stays in existing action handlers. */
(() => {
  'use strict';
  const scene = document.getElementById('scene');
  if (!scene) return;
  const videos = {
    Baby: {feed:'Jerry_Baby_Feed_4s.mp4',sleep:'Jerry_Baby_Sleep_4s.mp4',play:'Jerry_Baby_Play_4s.mp4',bath:'Jerry_Baby_Bath.mp4',house:'Jerry_Baby_House_4s.mp4',touch:'Jerry_Baby_Touch_Happy.mp4',dress:'Jerry_Baby_Dress.mp4'},
    Puppy: {feed:'Jerry_Puppy_Feed.mp4',sleep:'Jerry_Puppy_Sleep.mp4',play:'Jerry_Puppy_Play.mp4',bath:'Jerry_Puppy_Bath.mp4',house:'Jerry_Puppy_House_02.mp4',touch:'Jerry_Puppy_Touch_Happy.mp4',dress:'Jerry_Puppy_Dress.mp4'},
    Adult: {feed:'Jerry_Adult_Feed.mp4',play:'Jerry_Adult_Play.mp4',bath:'Jerry_Adult_Bath.mp4',house:'Jerry_Adult_House.mp4',touch:'Jerry_Adult_Touch_Happy.mp4',dress:'Jerry_Adult_Dress.mp4'}
  };
  const video = document.createElement('video');
  video.id = 'jerryLegacyClip';
  video.playsInline = true;
  video.muted = true;
  video.preload = 'none';
  video.setAttribute('aria-label', 'Jerry animation');
  Object.assign(video.style, {position:'absolute',left:'0',top:'0',width:'100%',height:'100%',objectFit:'contain',zIndex:'8',pointerEvents:'none',display:'none'});
  scene.append(video);
  let finish, timer;
  function stop(){
    clearTimeout(timer);
    video.pause();
    video.style.display='none';
    video.removeAttribute('src');
    video.load();
    if(finish){const callback=finish;finish=null;callback();}
  }
  video.addEventListener('ended',stop);
  video.addEventListener('error',stop);
  document.addEventListener('pawtopia-jerry-mode-change',stop);
  new MutationObserver(()=>{if(video.style.display!=='none' && scene.dataset.growthStage!==video.dataset.stage)stop();}).observe(scene,{attributes:true,attributeFilter:['data-growth-stage']});
  scene.addEventListener('pawtopia-jerry-action',event=>{
    if(window.pawtopiaJerryMode!=='2d')return;
    const stage=scene.dataset.growthStage||'Baby';
    const action=event.detail?.action;
    const file=videos[stage]?.[action];
    if(!file)return;
    stop();
    const onFinish=event.detail?.finishMeal||event.detail?.finishSleep;
    if(onFinish && event.cancelable){event.preventDefault();finish=()=>onFinish();}
    video.dataset.stage=stage;
    video.src='assets/videos/'+stage.toLowerCase()+'/'+file;
    video.style.display='block';
    const playPromise=video.play();
    if(playPromise?.catch)playPromise.catch(stop);
    timer=setTimeout(stop,12000);
  });
})();
