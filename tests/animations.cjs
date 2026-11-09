// Run with: node --test tests/animations.cjs
// Executes the shipped inline script; media events are simulated, not codec playback.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function game(xp=0){
 const elements={},timers=new Map(),logs=[];let seq=0;
 function element(id){return elements[id]??=(function(){const classes=new Set();return {id,hidden:['sleepVideo','shopOverlay','miniOverlay'].includes(id),style:{backgroundImage:''},attrs:{},textContent:'',currentTime:0,readyState:0,paused:true,ended:false,
 classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},toggle(x,on){on?classes.add(x):classes.delete(x)},contains:x=>classes.has(x)},
 setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},removeAttribute(k){delete this[k]},load(){},pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()},requestVideoFrameCallback(cb){this.frame=cb;return 1},cancelVideoFrameCallback(){this.frame=null},click(){this.onclick?.()},};})();}
 const saved=new Map([['jerry-save-v1',JSON.stringify({coins:100,xp})]]);
 const context={document:{getElementById:element,createElement:()=>element('preload'+seq++),addEventListener(){},hidden:false},window:{location:{search:''}},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},Image:function(){},URLSearchParams,Date,Number,Math,JSON,confirm:()=>true,console:{warn:(...x)=>logs.push(x),error:(...x)=>logs.push(x)},setTimeout:(cb,ms)=>{timers.set(++seq,{cb,ms});return seq},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},requestAnimationFrame:cb=>{cb();return 1},cancelAnimationFrame(){}};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 return {el:element,saved,logs,timers,state:()=>JSON.parse(saved.get('jerry-save-v1')),frame(){const v=element('sleepVideo');v.readyState=4;v.currentTime=.1;v.frame?.();}};
}
const actions={food:'Feed',sleep:'Sleep',bath:'Bath',ball:'Play',dress:'Dress',home:'House'};
for(const xp of [0,100])for(const [id,action]of Object.entries(actions))test(`${xp?'Puppy':'Baby'} ${id}: mapping, first frame and return`,()=>{
 const g=game(xp);g.el(id).click();const v=g.el('sleepVideo');const missing=xp===100&&id==='ball';
 if(missing){assert.equal(v.hidden,true);assert.match(g.el('growthHint').textContent,/No .* video/);return}
 assert.ok(fs.existsSync(v.src),v.src);assert.match(v.src,new RegExp('/'+(xp?'puppy':'baby')+'/'));assert.match(v.src,new RegExp(action));assert.equal(v.paused,false);assert.equal(g.el('scene').classList.contains('video-ready'),false);g.frame();assert.equal(g.el('scene').classList.contains('video-ready'),true);v.onended();assert.equal(v.hidden,true);assert.equal(g.el('scene').classList.contains('video-ready'),false);
});
test('media errors and load timeout recover, log context and allow retry',()=>{for(const timeout of [false,true]){const g=game();g.el('sleep').click();if(timeout){[...g.timers.values()].find(t=>t.ms===15000).cb()}else g.el('sleepVideo').onerror();assert.equal(g.el('sleepVideo').hidden,true);assert.ok(g.logs.some(x=>x[0].includes('Playback failed')));g.el('food').click();g.frame();assert.equal(g.el('scene').classList.contains('video-ready'),true)}});
test('XP persisted, cooldown retained, both growth transitions and Restart',()=>{for(const [xp,next]of [[90,'Puppy'],[290,'Teen']]){const g=game(xp);g.el('food').click();assert.equal(g.state().xp,xp+10);assert.equal(g.state().growthStage,next);g.el('food').click();assert.equal(g.state().xp,xp+10);const reloaded=game(g.state().xp);assert.equal(reloaded.state().growthStage,next);g.el('resetGrowth').click();assert.equal(g.state().xp,0);assert.equal(g.state().growthStage,'Baby');assert.equal(g.el('sleepVideo').hidden,true)}});
test('stale callbacks cannot reveal previous video; Idle and Touch use their current stage',()=>{const g=game();g.el('sleep').click();const stale=g.el('sleepVideo').frame;g.el('food').click();stale();assert.equal(g.el('scene').classList.contains('video-ready'),false);g.frame();g.el('sleepVideo').onended();g.el('portrait').click();assert.match(g.el('sleepVideo').src,/Touch_Happy/);g.el('sleepVideo').onended();[...g.timers.values()].find(t=>t.ms===3000).cb();assert.match(g.el('sleepVideo').src,/Idle/);const p=game(100);p.el('portrait').click();assert.match(p.el('sleepVideo').src,/puppy\/Jerry_Puppy_Touch_Happy/)});
test('every mapped video exists and no Dress is substituted',()=>{const map=html.match(/const growthVideos = ([\s\S]*?);\nvar activeMedia/)[1];const videos=vm.runInNewContext('('+map+')');for(const entries of Object.values(videos))for(const path of Object.values(entries))assert.ok(fs.existsSync(path),path);assert.equal(videos.Baby.dress,'assets/videos/baby/Jerry_Baby_Dress.mp4');assert.equal(videos.Puppy.dress,'assets/videos/puppy/Jerry_Puppy_Dress.mp4');assert.equal(videos.Puppy.play,undefined);assert.match(html,/scene-actions\{position:absolute;z-index:5/)});
test('affected actions use silent copies; working Baby clips keep original paths',()=>{const map=html.match(/const growthVideos = ([\s\S]*?);\nvar activeMedia/)[1];const videos=vm.runInNewContext('('+map+')');for(const [stage,keys]of [['Baby',['sleep','care']],['Puppy',['feed','sleep','care','house']]])for(const key of keys)assert.match(videos[stage][key],/videos\/silent\//);for(const key of ['feed','play','house','idle','touch'])assert.match(videos.Baby[key],/videos\/baby\//)});

test('Baby Dress replays three times and keeps saved XP behavior',()=>{const g=game();for(let i=0;i<3;i++){g.el('dress').click();assert.match(g.el('sleepVideo').src,/Jerry_Baby_Dress\.mp4$/);g.frame();assert.equal(g.el('scene').classList.contains('video-ready'),true);g.el('sleepVideo').onended();assert.equal(g.el('sleepVideo').hidden,true)}assert.equal(g.state().xp,0)});

test('Puppy Idle waits three seconds after animation, yields to actions and never awards XP',()=>{
 const g=game(100),idle=()=>[...g.timers.values()].find(t=>t.ms===3000),fireIdle=()=>{const [id,t]=[...g.timers].find(([,t])=>t.ms===3000);g.timers.delete(id);t.cb()};
 assert.ok(idle());fireIdle();assert.match(g.el('sleepVideo').src,/puppy\/Jerry_Puppy_Idle/);
 g.frame();assert.equal(g.state().xp,100);g.el('food').click();assert.match(g.el('sleepVideo').src,/Puppy_Feed/);assert.equal(idle(),undefined);
 g.el('sleepVideo').onended();assert.ok(idle());fireIdle();g.el('resetGrowth').click();assert.equal(g.el('sleepVideo').hidden,true);assert.equal(g.state().growthStage,'Baby');
});
test('Touch does not interrupt actions and remains muted with inline playback',()=>{
 const g=game(100);g.el('sleep').click();const src=g.el('sleepVideo').src;g.el('portrait').click();assert.equal(g.el('sleepVideo').src,src);
 g.el('sleepVideo').onended();g.el('portrait').click();const v=g.el('sleepVideo');assert.match(v.src,/Puppy_Touch/);assert.equal(v.muted,true);assert.equal(v.playsInline,true);g.frame();v.onended();assert.equal(v.hidden,true);
});
