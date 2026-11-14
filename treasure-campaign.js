/* Treasure Trail levels and independent, backwards-compatible save data. */
(function(root){'use strict';
const levels=[{gems:4,traps:2,seconds:90},{gems:4,traps:3,seconds:90},{gems:5,traps:3,seconds:85},{gems:5,traps:4,seconds:85},{gems:6,traps:4,seconds:80},{gems:6,traps:5,seconds:80},{gems:7,traps:5,seconds:75},{gems:7,traps:6,seconds:70},{gems:8,traps:6,seconds:65},{gems:8,traps:7,seconds:60}];
const finalReward=50;
function config(n){return Number.isInteger(n)&&n>=1&&n<=levels.length?levels[n-1]:null;}
function board(n){const c=config(n);if(!c)throw Error('Unknown Treasure Hunt level');let seed=7919*n+113;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const cells=Array.from({length:25},(_,i)=>({type:i<c.gems?'gem':i<c.gems+c.traps?'trap':'sand',open:false}));for(let i=24;i>0;i--){const j=Math.floor(random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}return cells;}
function stars(n,meta,won){const c=config(n);if(!won||!c||!meta||!Number.isInteger(meta.lives)||meta.lives<1||meta.lives>3||!Number.isFinite(meta.elapsed)||meta.elapsed<0||meta.elapsed>=c.seconds||meta.found!==c.gems)return 0;return meta.lives;}
function state(s){const old=s.treasureCampaign&&typeof s.treasureCampaign==='object'?s.treasureCampaign:{};return {stars:Array.from({length:10},(_,i)=>{const v=old.stars?.[i];return Number.isInteger(v)&&v>=0&&v<=3?v:0;}),bonusClaimed:old.bonusClaimed===true};}
function snapshot(s){const v=state(s);let unlocked=1;while(unlocked<10&&v.stars[unlocked-1]>0)unlocked++;return {...v,unlocked,completed:v.stars.filter(n=>n>0).length,totalStars:v.stars.reduce((a,b)=>a+b,0)};}
function record(s,meta,won){if(!meta||!config(meta.level)||meta.level>snapshot(s).unlocked)return 0;const count=stars(meta.level,meta,won);if(!count)return 0;const p=state(s);p.stars[meta.level-1]=Math.max(p.stars[meta.level-1],count);let bonus=0;if(p.stars.every(n=>n>0)&&!p.bonusClaimed){bonus=finalReward;p.bonusClaimed=true;s.coins+=bonus;}s.treasureCampaign=p;return bonus;}
const api={levels,finalReward,config,board,stars,snapshot,record};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaTreasureCampaign=api;
})(typeof window!=='undefined'?window:globalThis);
