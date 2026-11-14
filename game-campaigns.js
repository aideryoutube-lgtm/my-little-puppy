/* Ten-round trails for the remaining arcade games. Existing trail saves stay separate. */
(function(root){'use strict';
const specs={
 blast:{unit:'lines',coins:10,goals:[2,3,4,5,6,7,8,9,10,11]},
 blocks:{unit:'lines',coins:10,goals:[1,2,3,4,5,6,7,8,9,10]},
 snake:{unit:'apples',coins:8,goals:[3,4,5,6,7,8,9,10,11,12]},
 treats:{unit:'treats',coins:6,goals:[4,6,8,10,12,14,16,18,20,22]},
 bone:{unit:'bones',coins:10,goals:[5,7,9,11,13,15,17,19,21,23]},
 ball:{unit:'balls',coins:10,goals:[3,4,5,6,7,8,9,10,11,12]},
 jump:{unit:'m',coins:10,goals:[60,80,100,120,140,160,180,200,220,240]},
 puzzle:{unit:'picture',coins:3,goals:Array(10).fill(1)},
 merge:{unit:'tile',coins:10,goals:[16,32,32,64,64,128,128,128,256,256]},
 moles:{unit:'moles',coins:8,goals:[5,7,9,11,13,15,17,19,21,23]},
 maze:{unit:'exit',coins:8,goals:Array(10).fill(1)},
 match:{unit:'treats',coins:10,goals:[15,20,25,30,35,40,45,50,55,60]}
};
const kinds=Object.keys(specs),finalReward=50,levels={};
for(const kind of kinds)levels[kind]=specs[kind].goals.map((goal,i)=>{
 const c={goal,coins:specs[kind].coins,seconds:0,seed:1201+i*7919+kinds.indexOf(kind)*104729,metric:'moves',threeStar:goal*10,twoStar:goal*16};
 if(kind==='blocks'){c.fallSpeed=.95-i*.045;c.metric='elapsed';c.threeStar=goal*25;c.twoStar=goal*45;}
 if(kind==='snake'){c.stepSpeed=.32-i*.01;c.metric='elapsed';c.threeStar=goal*15;c.twoStar=goal*30;}
 if(['treats','ball','jump','moles'].includes(kind)){c.metric='lives';c.threeStar=3;c.twoStar=2;c.seconds=kind==='treats'?45-i:kind==='jump'?60:45;}
 if(kind==='bone'){c.seconds=35;c.metric='mistakes';c.threeStar=0;c.twoStar=2;}
 if(kind==='puzzle'){c.size=i<3?3:i<7?4:5;c.coins={3:3,4:6,5:10}[c.size];c.threeStar=c.size*c.size;c.twoStar=c.threeStar*2;}
 if(kind==='merge'){c.threeStar=goal;c.twoStar=goal*2;}
 if(kind==='maze'){c.size=[7,7,9,9,9,11,11,11,13,13][i];c.threeStar=c.size*c.size;c.twoStar=Math.ceil(c.threeStar*1.5);}
 if(kind==='match'){c.moveLimit=15+i;c.threeStar=Math.ceil(c.moveLimit*.5);c.twoStar=Math.ceil(c.moveLimit*.8);}
 c.detail=kind==='puzzle'?c.size+' × '+c.size:kind==='maze'?c.size+' × '+c.size:goal+' '+specs[kind].unit+(c.seconds?' · '+c.seconds+'s':'');
 return c;
});
function config(kind,n){return kinds.includes(kind)&&Number.isInteger(n)&&n>=1&&n<=10?levels[kind][n-1]:null;}
function configure(g,level){const c=config(g.kind,level);if(!c)return false;g.campaignLevel=level;g.level=g.kind==='puzzle'?c.size:level;g.targetGoal=c.goal;g.timeLimit=c.seconds;g.moveLimit=c.moveLimit;g.fallSpeed=c.fallSpeed;g.stepSpeed=c.stepSpeed;g.size=c.size;g.mistakes=0;let seed=c.seed;g.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};return true;}
function progress(g){if(['blast','blocks'].includes(g.kind))return g.lines;if(g.kind==='jump')return Math.floor(g.distance);if(g.kind==='puzzle')return g.tiles.every((v,i)=>v===i)?1:0;if(g.kind==='maze')return g.position===g.goal?1:0;if(g.kind==='merge')return Math.max(...g.tiles);if(g.kind==='match')return g.collected;return g.score;}
function meta(g){return {level:g.campaignLevel,progress:progress(g),moves:g.moves,elapsed:g.elapsed,lives:g.lives??3,mistakes:g.mistakes||0};}
function stars(kind,n,m,won){const c=config(kind,n);if(!won||!c||!m||!Number.isFinite(m.progress)||m.progress<c.goal||!Number.isInteger(m.moves)||m.moves<0||!Number.isFinite(m.elapsed)||m.elapsed<0||!Number.isInteger(m.lives)||m.lives<1||m.lives>3||!Number.isInteger(m.mistakes)||m.mistakes<0||c.seconds&&m.elapsed>=c.seconds)return 0;const v=m[c.metric];return c.metric==='lives'?(v>=3?3:v>=2?2:1):v<=c.threeStar?3:v<=c.twoStar?2:1;}
function state(s,kind){const old=s.arcadeCampaigns?.[kind]||{};return {stars:Array.from({length:10},(_,i)=>{const n=old.stars?.[i];return Number.isInteger(n)&&n>=0&&n<=3?n:0;}),bonusClaimed:old.bonusClaimed===true};}
function snapshot(s,kind){const p=state(s,kind);let unlocked=1;while(unlocked<10&&p.stars[unlocked-1])unlocked++;return {...p,unlocked,completed:p.stars.filter(Boolean).length,totalStars:p.stars.reduce((a,b)=>a+b,0)};}
function record(s,kind,m,won){if(!m||!config(kind,m.level)||m.level>snapshot(s,kind).unlocked)return 0;const n=stars(kind,m.level,m,won);if(!n)return 0;const p=state(s,kind);p.stars[m.level-1]=Math.max(p.stars[m.level-1],n);let bonus=0;if(p.stars.every(Boolean)&&!p.bonusClaimed){p.bonusClaimed=true;s.coins+=finalReward;bonus=finalReward;}s.arcadeCampaigns={...(s.arcadeCampaigns||{}),[kind]:p};return bonus;}
function forKind(kind){if(!kinds.includes(kind))return null;return {levels:levels[kind],finalReward,config:n=>config(kind,n),stars:(n,m,won)=>stars(kind,n,m,won)};}
function rules(kind,n){const c=config(kind,n),controls={blast:'Place shapes to fill rows or columns.',blocks:'Move, rotate and drop blocks.',snake:'Swipe or use arrows; avoid walls and your tail.',treats:'Tap the matching treat.',bone:'Catch bones; avoid boots.',ball:'Change lanes; collect balls and avoid rocks.',jump:'Tap to jump over crates.',puzzle:'Tap two pieces to swap them.',merge:'Swipe or use arrows to merge equal numbers.',moles:'Tap moles; avoid bombs.',maze:'Use arrows, swipe or tap a neighboring path.',match:'Swap neighboring treats to match 3 or more.'};const target=['blast','blocks'].includes(kind)?'Clear '+c.goal+' lines':kind==='jump'?'Travel '+c.goal+' m':kind==='puzzle'?'Rebuild the '+c.size+' × '+c.size+' picture':kind==='maze'?'Reach the bone':kind==='merge'?'Reach tile '+c.goal:'Collect '+c.goal+' '+specs[kind].unit;const starsText=c.metric==='lives'?'★★★ no hits · ★★ one hit · ★ finish.':c.metric==='mistakes'?'★★★ no boots · ★★ up to 2 boots · ★ finish.':'★★★ ≤'+c.threeStar+' · ★★ ≤'+c.twoStar+' '+(c.metric==='elapsed'?'seconds':'moves')+' · ★ finish.';return controls[kind]+' '+target+(c.seconds?' in '+c.seconds+'s':kind==='match'?' in '+c.moveLimit+' moves':'')+'. '+starsText;}
function stats(g){const c=config(g.kind,g.campaignLevel);if(['puzzle','maze','merge','blast','match'].includes(g.kind))return c.detail+' · '+g.moves+' moves';return progress(g)+'/'+c.goal+' '+specs[g.kind].unit+' · '+Math.floor(g.elapsed)+'s'+(c.metric==='lives'?' · ♥ '+g.lives:c.metric==='mistakes'?' · '+g.mistakes+' boots':'');}
const api={stats,kinds,levels,finalReward,config,configure,progress,meta,stars,snapshot,record,forKind,rules};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaGameCampaigns=api;
})(typeof window!=='undefined'?window:globalThis);
