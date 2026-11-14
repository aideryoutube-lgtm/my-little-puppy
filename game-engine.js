/* Deterministic game rules shared by the UI and regression tests. */
(function(root){'use strict';
const catalog={memory:{name:'Memory Pairs',icon:'🃏',seconds:90,rule:'Find all 6 matching pairs in 90 seconds. Complete the board to earn 8 coins.',coins:8},treats:{name:'Treat Time',icon:'🍖',seconds:45,rule:'Tap the matching treat shown above the board. Get 12 right in 45 seconds. Three mistakes end the round. Win 6 coins.',coins:6},bone:{name:'Bone Catch',icon:'🦴',seconds:30,rule:'Tap falling bones (+1). Avoid muddy boots (−2).'},ball:{name:'Ball Run',icon:'🎾',seconds:60,rule:'Swipe left or right to change lanes. Collect balls, avoid rocks. Three hearts.'},treasure:{name:'Treasure Hunt',icon:'💎',seconds:60,rule:'Dig for 6 treasures. Numbers show nearby traps, including diagonals. Three traps end the hunt.'},jump:{name:'Jump Adventure',icon:'🌈',seconds:90,rule:'Tap to jump. Clear the crates as Jerry runs faster. Three hearts.'},puzzle:{name:'Puzzle Time',icon:'🧩',seconds:0,rule:'Tap two pieces to swap them. Rebuild Jerry’s picture. Gold borders mark correct pieces.'}};
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function create(kind,level=3,random=Math.random){if(!catalog[kind])throw Error('Unknown game');level=[3,4,5].includes(level)?level:3;const g={kind,level,random,status:'ready',elapsed:0,score:0,lives:3,distance:0,items:[],spawn:0,lane:1,y:0,vy:0,invincible:0,seq:0,moves:0,selected:null,event:null};
if(kind==='treasure'){g.cells=shuffle([...Array(25)].map((_,i)=>({type:i<6?'gem':i<11?'trap':'sand',open:false})),random);g.found=0;g.cells.forEach((c,i)=>{c.near=g.cells.reduce((n,v,j)=>n+(v.type==='trap'&&j!==i&&Math.abs(Math.floor(i/5)-Math.floor(j/5))<=1&&Math.abs(i%5-j%5)<=1?1:0),0);});}
if(kind==='puzzle'){g.tiles=shuffle([...Array(level*level).keys()],random);if(g.tiles.every((v,i)=>v===i))[g.tiles[0],g.tiles[1]]=[g.tiles[1],g.tiles[0]];}
if(kind==='memory'){g.cards=shuffle([0,1,2,3,4,5,0,1,2,3,4,5],random);g.matched=[];g.flipped=[];g.hideAt=0;g.found=0;}
if(kind==='treats'){g.target=Math.floor(random()*6);g.previousTarget=null;}
return g;}
function start(g){if(g.status==='ready')g.status='playing';}
function pause(g){if(g.status==='playing')g.status='paused';else if(g.status==='paused')g.status='playing';}
function end(g,won=false){g.status='over';g.won=won;g.event=won?'win':'end';}
function action(g,type,value){if(g.status!=='playing')return false;g.event=null;
if(g.kind==='memory'&&type==='card'){if(!Number.isInteger(value)||value<0||value>=12||g.hideAt||g.matched.includes(value)||g.flipped.includes(value))return false;g.flipped.push(value);if(g.flipped.length===2){g.moves++;const [a,b]=g.flipped;if(g.cards[a]===g.cards[b]){g.matched.push(a,b);g.flipped=[];g.found++;g.score+=10;g.event='coin';if(g.found===6)end(g,true);}else{g.hideAt=g.elapsed+.8;g.event='hurt';}}return true;}
if(g.kind==='treats'&&type==='treat'){if(!Number.isInteger(value)||value<0||value>5)return false;if(value===g.target){g.score++;g.event='coin';g.previousTarget=g.target;g.target=(g.target+1+Math.floor(g.random()*5))%6;if(g.score>=12)end(g,true);}else{g.lives--;g.event='hurt';if(g.lives===0)end(g);}return true;}
if(g.kind==='ball'&&type==='lane'){g.lane=Math.max(0,Math.min(2,g.lane+value));return true;}
if(g.kind==='jump'&&type==='jump'&&g.y===0){g.vy=1.65;g.event='jump';return true;}
if(g.kind==='bone'&&type==='catch'){const o=g.items.find(o=>o.id===value);if(!o)return false;g.score+=o.bad?-2:1;g.items=g.items.filter(v=>v!==o);g.event=o.bad?'hurt':'coin';return true;}
if(g.kind==='treasure'&&type==='dig'){const c=g.cells[value];if(!c||c.open)return false;c.open=true;if(c.type==='gem'){g.found++;g.score+=5;g.event='coin';}else if(c.type==='trap'){g.lives--;g.event='hurt';}else{g.event='dig';}if(g.found===6)end(g,true);else if(g.lives<=0)end(g);return true;}
if(g.kind==='puzzle'&&type==='tile'){if(!Number.isInteger(value)||value<0||value>=g.tiles.length)return false;if(g.selected===null){g.selected=value;return true;}if(g.selected===value){g.selected=null;return true;}[g.tiles[value],g.tiles[g.selected]]=[g.tiles[g.selected],g.tiles[value]];g.selected=null;g.moves++;g.event='dig';if(g.tiles.every((v,i)=>v===i)){g.score=Math.max(1,Math.round(1000* g.level/3-g.elapsed*2-g.moves*5));end(g,true);}return true;}return false;}
function tick(g,dt){if(g.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;g.event=null;g.elapsed+=dt;const limit=catalog[g.kind].seconds;if(limit&&g.elapsed>=limit){end(g,!['treasure','memory','treats'].includes(g.kind));return;}
if(g.kind==='memory'&&g.hideAt&&g.elapsed>=g.hideAt){g.flipped=[];g.hideAt=0;}
if(!['bone','ball','jump'].includes(g.kind))return;
g.invincible=Math.max(0,g.invincible-dt);g.spawn+=dt;
if(g.kind==='jump'){g.distance+=dt*(8+g.elapsed*.15);g.score=Math.floor(g.distance);g.y=Math.max(0,g.y+g.vy*dt);g.vy-=4.2*dt;if(g.y===0)g.vy=0;if(g.spawn>=Math.max(.85,1.8-g.elapsed*.012)){g.spawn=0;g.items.push({id:++g.seq,x:1.1});}for(const o of [...g.items]){o.x-=dt*(.38+g.elapsed*.003);if(o.x<.22&&o.x>.07&&!o.checked){o.checked=true;if(g.y<.16&&g.invincible===0){g.lives--;g.invincible=1;g.event='hurt';}else g.event='coin';}}g.items=g.items.filter(o=>o.x>-.12);
}else{if(g.kind==='ball')g.distance+=dt*9;const interval=g.kind==='bone'?.42:Math.max(.45,.8-g.elapsed*.004);if(g.spawn>=interval){g.spawn=0;g.items.push({id:++g.seq,x:g.random(),y:-.12,lane:Math.floor(g.random()*3),bad:g.random()<(g.kind==='bone'?.22:.35)});}for(const o of [...g.items]){o.y+=dt*(g.kind==='bone'?.3+o.x*.2:.38+g.elapsed*.003);if(g.kind==='ball'&&o.y>=.78&&!o.checked){o.checked=true;if(o.lane===g.lane){if(o.bad){if(!g.invincible){g.lives--;g.invincible=.8;g.event='hurt';}}else{g.score++;g.event='coin';}}}}g.items=g.items.filter(o=>o.y<1.12);}
if(g.lives<=0)end(g);}
function reward(g){if(g.status!=='over')return 0;if(['memory','treats'].includes(g.kind))return g.won?catalog[g.kind].coins:0;if(g.kind==='puzzle')return g.won?({3:3,4:6,5:10}[g.level]):0;return Math.min(10,Math.floor(Math.max(0,g.score)/(g.kind==='jump'?50:g.kind==='treasure'?3:5)));}
const api={catalog,create,start,pause,action,tick,reward};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaGames=api;
})(typeof window!=='undefined'?window:globalThis);

