const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('./game-engine.js');
let m=E.create('memory'); E.start(m);
const pairs=Array.from({length:6},(_,n)=>m.cards.flatMap((v,i)=>v===n?[i]:[]));
for(const [a,b] of pairs){E.action(m,'card',a);assert.equal(E.action(m,'card',a),false);E.action(m,'card',b);}
assert.equal(m.won,true);assert.equal(E.reward(m),8);
m=E.create('memory');E.start(m);let b=m.cards.findIndex(v=>v!==m.cards[0]);E.action(m,'card',0);E.action(m,'card',b);assert.equal(E.action(m,'card',2),false);E.pause(m);E.tick(m,1);assert.equal(m.flipped.length,2);E.pause(m);E.tick(m,1);assert.equal(m.flipped.length,0);E.tick(m,90);assert.equal(m.won,false);assert.equal(E.reward(m),0);
let t=E.create('treats');E.start(t);for(let i=0;i<12;i++){const prev=t.target;E.action(t,'treat',prev);assert.notEqual(t.target,prev);}assert.equal(t.won,true);assert.equal(E.reward(t),6);
t=E.create('treats');E.start(t);for(let i=0;i<3;i++)E.action(t,'treat',(t.target+1)%6);assert.equal(t.won,false);assert.equal(E.reward(t),0);
t=E.create('treats');E.start(t);E.tick(t,45);assert.equal(t.won,false);assert.equal(E.reward(t),0);
for(const kind of ['bone','ball','treasure','jump','puzzle']){const g=E.create(kind);E.start(g);E.tick(g,.1);assert.equal(g.status,'playing');assert.equal(E.reward(g),0);}
// Run the actual persistence function with a saved balance and XP.
const html=fs.readFileSync('index.html','utf8');const body=html.split('finish:function(kind,id,score,coins,won){')[1].split('}};')[0];
let data=null,fail=false;const ctx={s:{coins:123,xp:137},window:{pawtopiaMini:{record:()=>0}},localStorage:{setItem:(k,v)=>{if(fail)throw Error('full');data=v;}},update:()=>{}};vm.createContext(ctx);vm.runInContext('finish=function(kind,id,score,coins,won){'+body+'}',ctx);
assert.equal(ctx.finish('memory','round-1',60,8,true),true);assert.equal(ctx.s.coins,131);assert.equal(ctx.s.xp,137);assert.equal(ctx.finish('memory','round-1',60,8,true),true);assert.equal(ctx.s.coins,131);assert.equal(ctx.s.miniGames.memory.rounds,1);
ctx.s=JSON.parse(data);assert.equal(ctx.s.coins,131);ctx.finish('treats','round-2',12,6,true);assert.equal(ctx.s.coins,137);fail=true;assert.equal(ctx.finish('memory','round-3',60,8,true),false);assert.equal(ctx.s.coins,137);fail=false;assert.equal(ctx.finish('memory','round-3',60,8,true),true);assert.equal(ctx.s.coins,145);
console.log('PASS: wins, losses, timeout, pause, mismatch lock, legacy games, rewards, duplicate protection, reload and failed-save retry; XP preserved.');
