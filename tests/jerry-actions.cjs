// Run with: node --test tests/animations.cjs
// Executes the shipped inline script against isolated saved progress.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function game(progress=0){
 const state=typeof progress==='number'?{xp:progress}:progress;
 const elements={},timers=new Map(),logs=[];let seq=0;
 function element(id){return elements[id]??=(function(){const classes=new Set();return {id,hidden:['shopOverlay','miniOverlay'].includes(id),style:{backgroundImage:''},attrs:{},textContent:'',
 classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},toggle(x,on){on?classes.add(x):classes.delete(x)},contains:x=>classes.has(x)},
 addEventListener(){},hasAttribute(){return false;},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},removeAttribute(k){delete this[k]},click(){this.onclick?.()},};})();}
 const saved=new Map([['jerry-save-v1',JSON.stringify({coins:100,...state})]]);
 const context={document:{getElementById:element,createElement:()=>element('preload'+seq++),addEventListener(){},hidden:false},window:{location:{search:''},PawtopiaWorldCore:require('../world-core.js')},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},Image:function(){},URLSearchParams,Date,Number,Math,JSON,confirm:()=>true,console:{warn:(...x)=>logs.push(x),error:(...x)=>logs.push(x)},setTimeout:(cb,ms)=>{timers.set(++seq,{cb,ms});return seq},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},requestAnimationFrame:cb=>{cb();return 1},cancelAnimationFrame(){}};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 return {world:context.window.pawtopiaWorld,api:context.window.pawtopiaMini,el:element,saved,logs,timers,state:()=>JSON.parse(saved.get('jerry-save-v1'))};
}
const actions = {
 food: s => s.hunger === 80 && s.feedCount === 1,
 sleep: s => s.energy === 100,
 bath: s => s.clean === 90 && s.bathCount === 1,
 ball: s => s.fun === 85 && s.playCount === 1 && s.energy === 75,
 dress: s => s.xp >= 0,
 home: s => s.hasHome === true
};
for(const [xp,stage] of [[0,'Baby'],[100,'Puppy'],[600,'Adult']]){
 for(const [id,check] of Object.entries(actions))test(stage+' '+id+' works without a player',()=>{
  const g=game(xp);
  g.el(id).click();
  assert(check(g.state()));
  assert.equal(g.state().growthStage,stage);
  assert.equal(g.state().coins,100);
  assert.doesNotMatch(html, /<video\b|assets\/videos\/|requestVideoFrameCallback/);
 });
}
test('Baby earns 10 XP per consecutive meal, grows at 200 and reloads without regression',()=>{
 const g=game({xp:0,growthRules:2,growthStage:'Baby'});
 assert.equal(g.el('growthXP').textContent,'0 / 200 XP');
 for(let i=1;i<=20;i++){
  g.el('food').click();
  assert.equal(g.state().xp,i*10);
  assert.equal(g.state().growthStage,i<20?'Baby':'Puppy');
  assert.equal(g.el('growthXP').textContent,i<20?i*10+' / 200 XP':'100 / 200 XP');
  if(i===10)assert.equal(game(g.state()).state().growthStage,'Baby');
 }
 const reloaded=game(g.state());
 assert.equal(reloaded.state().growthStage,'Puppy');
 assert.equal(reloaded.state().xp,200);
 for(let i=0;i<10;i++)reloaded.el('food').click();
 assert.equal(reloaded.state().growthStage,'Adult');
 assert.equal(reloaded.state().xp,300);
 reloaded.el('food').click();
 assert.equal(reloaded.state().xp,310);
 assert.equal(reloaded.state().growthStage,'Adult');
 reloaded.el('resetGrowth').click();
 assert.equal(reloaded.el('growthXP').textContent,'0 / 200 XP');
});
test('an existing Baby keeps 70 XP and receives the larger growth scale',()=>{
 const g=game({xp:70,growthStage:'Baby'});
 assert.equal(g.el('growthXP').textContent,'70 / 200 XP');
 assert.equal(g.state().growthStage,'Baby');
});
test('legacy XP boundaries still select their correct growth stages',()=>{
 for(const [xp,stage] of [[99,'Baby'],[100,'Puppy'],[299,'Puppy'],[300,'Adult'],[599,'Adult'],[600,'Adult'],[2000,'Adult']]){
  const g=game(xp);
  assert.equal(g.state().xp,xp);
  assert.equal(g.state().growthStage,stage);
  if(stage==='Adult')assert.match(g.el('portrait').style.backgroundImage,/Jerry_Growth_4/);
 }
});
test('no global capturing pointer, key or click listeners are installed',()=>{assert.doesNotMatch(html,/document\.addEventListener\(['"](?:pointerdown|keydown|click)/)});

test('Bone Catch rewards persist once per round, cap at 10, and preserve all pet progress',()=>{const g=game(160),before=g.state();assert.equal(before.coins,100);assert.equal(g.api.reward('round-1',29),true);assert.equal(g.state().coins,105);assert.equal(g.state().boneBest,29);assert.equal(g.api.reward('round-1',29),false);assert.equal(g.state().coins,105);g.api.reward('round-2',999);assert.equal(g.state().coins,115);g.api.reward('round-3',-5);assert.equal(g.state().coins,115);assert.equal(g.state().xp,before.xp);assert.equal(g.state().hunger,before.hunger);assert.equal(g.state().growthStage,before.growthStage);});
test('All five mini games persist capped rewards and XP exactly once and preserve pet needs',()=>{const g=game(160);for(const kind of ['bone','ball','treasure','jump','puzzle']){const before=g.state();assert.equal(g.api.finish(kind,kind+'-round',100,999,true),true);assert.equal(g.state().coins,before.coins+10);assert.equal(g.api.finish(kind,kind+'-round',100,999,true),true);assert.equal(g.state().coins,before.coins+10);assert.equal(g.state().miniGames[kind].rounds,1);assert.equal(g.state().miniGames[kind].wins,1);assert.equal(g.state().xp,before.xp+10);for(const key of ['hunger','clean','fun','growthStage'])assert.equal(g.state()[key],before[key]);}});
test('failed mini-game save rolls back coins, record and claim; retry then pays once',()=>{const g=game(100),set=g.saved.set.bind(g.saved),before=g.state();g.saved.set=()=>{throw Error('storage full')};assert.equal(g.api.finish('ball','retry-round',50,10,true),false);assert.equal(g.api.record('ball'),0);g.saved.set=set;assert.equal(g.api.finish('ball','retry-round',50,10,true),true);assert.equal(g.state().coins,before.coins+10);assert.equal(g.state().miniGames.ball.rounds,1);});

test('World migration preserves existing progress, and paid inventory shares mini-game balance',()=>{const g=game(160),old=g.state();assert.equal(old.schemaVersion,4);assert.equal(old.coins,100);assert.equal(g.world.commit('buy','cap').ok,true);assert.equal(g.state().coins,85);assert.equal(g.world.commit('buy','cap').ok,false);assert.equal(g.state().coins,85);assert.equal(g.world.commit('equip','cap').ok,true);assert.equal(g.state().world.equipped.hat,'cap');assert.equal(g.world.commit('unequip','cap').ok,true);g.api.finish('ball','shop-reward',50,10,true);assert.equal(g.state().coins,95);assert.equal(g.state().xp,old.xp+10);for(const key of ['hunger','fun','clean'])assert.equal(g.state()[key],old[key]);assert.ok(g.saved.has('jerry-save-v1-backup-pre-v3'));});
test('World purchase and food transactions cannot overspend and roll back on storage failure',()=>{const g=game(),set=g.saved.set.bind(g.saved);g.world.commit('buy','space');assert.equal(g.state().coins,0);assert.equal(g.world.commit('buy','blue').ok,false);assert.equal(g.world.commit('food','kibble').ok,false);g.api.finish('bone','coins',50,10,true);g.saved.set=()=>{throw Error('full')};assert.equal(g.world.commit('buy','blue').ok,false);assert.equal(g.world.snapshot().coins,10);assert.equal(g.world.snapshot().world.owned.includes('blue'),false);g.saved.set=set;assert.equal(g.world.commit('buy','blue').ok,true);assert.equal(g.state().coins,0);});
test('sleep restores canonical Energy, play uses it, and world room changes preserve needs and XP',()=>{const g=game(100);g.el('ball').click();assert.equal(g.state().energy,75);g.el('sleep').click();assert.equal(g.state().energy,100);const before=g.state();g.world.commit('room','bedroom');for(const k of ['xp','hunger','fun','clean','energy','coins'])assert.equal(g.state()[k],before[k]);});
