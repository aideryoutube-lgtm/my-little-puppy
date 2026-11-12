/* Bone Catch, integrated from 0e1cbaba. Rewards use Pawtopia's existing save. */
(()=>{'use strict';
const $=id=>document.getElementById(id),api=window.pawtopiaMini;
const games=[['🎾','Ball Run'],['💎','Treasure Hunt'],['🌈','Jump Adventure'],['🧩','Puzzle Time']];
$('futureGames').innerHTML=games.map(([icon,name])=>`<div class="future-game">${icon} ${name}<small>Coming Soon</small></div>`).join('');
let playing=false,score=0,endAt=0,last=0,spawn=0,raf=0,objects=[],roundId='',awarded=false;
const field=$('boneField');
function clear(){cancelAnimationFrame(raf);objects.forEach(o=>o.el.remove());objects=[];}
function best(){let legacy=0;try{legacy=Number(localStorage.getItem('jerry-bone-catch-best-v1'))||0;}catch{}return Math.max(api.best(),legacy);}
function stop(){playing=false;clear();}
function hub(){stop();$('boneGame').hidden=true;$('gamesHub').hidden=false;$('boneStart').focus();}
function finish(){if(!playing)return;stop();$('boneTime').textContent='0';const coins=Math.min(10,Math.floor(Math.max(0,score)/5));if(!awarded){awarded=api.reward(roundId,score);}$('boneBest').textContent=Math.max(best(),score);$('boneMessage').textContent=awarded?`Round complete! ${score} points · +${coins} coins saved.`:'Unable to save. Keep this screen open and tap Retry Save.';$('boneAgain').hidden=false;$('boneAgain').textContent=awarded?'Play Again':'Retry Save';}
function create(){const bad=Math.random()<.22,el=document.createElement('button');el.className='bone';el.type='button';el.textContent=bad?'🥾':'🦴';el.setAttribute('aria-label',bad?'Muddy boot: minus 2':'Bone: plus 1');const o={el,x:Math.random()*Math.max(1,field.clientWidth-58),y:-58,speed:100+Math.random()*80,hit:false};el.style.left=o.x+'px';el.style.top='-58px';field.append(el);objects.push(o);
function hit(e){e.preventDefault();if(!playing||o.hit||performance.now()>=endAt)return;o.hit=true;score+=bad?-2:1;$('boneScore').textContent=score;$('boneMessage').textContent=bad?'Muddy boot! −2 points':'Nice catch! +1 point';el.remove();objects=objects.filter(v=>v!==o);}
el.addEventListener('pointerdown',hit);el.addEventListener('click',hit);}
function frame(now){if(!playing)return;if(now>=endAt){finish();return;}const dt=Math.min((now-last)/1000,.05);last=now;$('boneTime').textContent=Math.ceil((endAt-now)/1000);spawn+=dt;if(spawn>=.42){spawn=0;create();}for(const o of [...objects]){o.y+=o.speed*dt;o.el.style.top=o.y+'px';if(o.y>field.clientHeight){o.el.remove();objects=objects.filter(v=>v!==o);}}raf=requestAnimationFrame(frame);}
function start(){if(playing)return;clear();$('gamesHub').hidden=true;$('boneGame').hidden=false;$('boneAgain').hidden=true;score=0;spawn=0;awarded=false;roundId=crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random();$('boneScore').textContent='0';$('boneTime').textContent='30';$('boneBest').textContent=best();$('boneMessage').textContent='Catch the bones!';playing=true;last=performance.now();endAt=last+30000;raf=requestAnimationFrame(frame);}
if(location.hash==='#bone-catch'){api.open();start();}
$('miniLaunch').onclick=()=>{api.open();hub();};$('boneStart').onclick=start;
$('boneAgain').onclick=()=>{if(!awarded){awarded=api.reward(roundId,score);if(awarded){$('boneMessage').textContent='Reward saved!';$('boneAgain').textContent='Play Again';}}else start();};
$('boneBack').onclick=hub;$('miniClose').onclick=()=>{stop();api.close();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('miniOverlay').hidden){stop();api.close();}if(e.key==='Tab'&&!$('miniOverlay').hidden){const buttons=[...$('miniOverlay').querySelectorAll('button')].filter(b=>b.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){stop();$('boneAgain').hidden=false;awarded=true;$('boneAgain').textContent='Play Again';$('boneMessage').textContent='Round cancelled while away. No reward claimed.';}});
})();
