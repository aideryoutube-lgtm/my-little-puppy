/* Ten authored bubble rounds and persistent progression; no changes to other games. */
(function(root){'use strict';
const levels=[
 {rows:2,colors:2,shots:35,pattern:0},{rows:2,colors:2,shots:35,pattern:1},
 {rows:3,colors:3,shots:35,pattern:0},{rows:3,colors:3,shots:33,pattern:1},
 {rows:4,colors:3,shots:32,pattern:2},{rows:4,colors:4,shots:30,pattern:0},
 {rows:5,colors:4,shots:29,pattern:1},{rows:5,colors:4,shots:28,pattern:2},
 {rows:6,colors:4,shots:26,pattern:0},{rows:6,colors:4,shots:24,pattern:2}
];
const finalReward=50;
function config(n){return Number.isInteger(n)&&n>=1&&n<=10?levels[n-1]:null;}
function board(n){const c=config(n);if(!c)throw Error('Unknown Bubble Rescue level');const a=Array(80).fill(0);for(let y=0;y<c.rows;y++)for(let x=0;x<8;x++)a[y*8+x]=1+(Math.floor(x/2)+(c.pattern===0?Math.floor(y/2):c.pattern===1?y:Math.floor((y+1)/2))+n-1)%c.colors;return a;}
function stars(n,shots,won){const c=config(n);if(!won||!c||!Number.isInteger(shots)||shots<1||shots>c.shots)return 0;return shots<=Math.ceil(c.shots*.4)?3:shots<=Math.ceil(c.shots*.7)?2:1;}
function state(s){const old=s.bubbleCampaign&&typeof s.bubbleCampaign==='object'?s.bubbleCampaign:{},best=Array.from({length:10},(_,i)=>Math.max(0,Math.min(3,Math.floor(Number(old.stars?.[i])||0))));return {stars:best,bonusClaimed:!!old.bonusClaimed};}
function snapshot(s){const v=state(s);let unlocked=1;while(unlocked<10&&v.stars[unlocked-1]>0)unlocked++;return {...v,unlocked,completed:v.stars.filter(v=>v>0).length,totalStars:v.stars.reduce((a,b)=>a+b,0)};}
function record(s,meta,won){if(!meta||!config(meta.level)||meta.level>snapshot(s).unlocked)return 0;const count=stars(meta.level,meta.shots,won);if(!count)return 0;const p=state(s);p.stars[meta.level-1]=Math.max(p.stars[meta.level-1],count);let bonus=0;if(p.stars.every(v=>v>0)&&!p.bonusClaimed){bonus=finalReward;p.bonusClaimed=true;s.coins+=bonus;}s.bubbleCampaign=p;return bonus;}
const api={levels,finalReward,config,board,stars,snapshot,record};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaBubbleCampaign=api;
})(typeof window!=='undefined'?window:globalThis);
