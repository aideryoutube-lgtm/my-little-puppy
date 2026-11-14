/* Memory Trail keeps its progression independent of other games and old saves. */
(function(root){'use strict';
const levels=[{pairs:3,seconds:60},{pairs:4,seconds:65},{pairs:4,seconds:60},{pairs:5,seconds:75},{pairs:5,seconds:65},{pairs:6,seconds:90},{pairs:6,seconds:75},{pairs:8,seconds:105},{pairs:8,seconds:90},{pairs:10,seconds:120}];
const finalReward=50;
function config(n){return Number.isInteger(n)&&n>=1&&n<=levels.length?levels[n-1]:null;}
function stars(n,meta,won){const c=config(n);if(!won||!c||!meta||meta.found!==c.pairs||!Number.isInteger(meta.moves)||meta.moves<c.pairs||!Number.isFinite(meta.elapsed)||meta.elapsed<0||meta.elapsed>=c.seconds)return 0;return meta.moves<=c.pairs+Math.ceil(c.pairs/2)?3:meta.moves<=c.pairs*2?2:1;}
function state(s){const old=s.memoryCampaign&&typeof s.memoryCampaign==='object'?s.memoryCampaign:{};return {stars:Array.from({length:10},(_,i)=>{const v=old.stars?.[i];return Number.isInteger(v)&&v>=0&&v<=3?v:0;}),bonusClaimed:old.bonusClaimed===true};}
function snapshot(s){const p=state(s);let unlocked=1;while(unlocked<10&&p.stars[unlocked-1]>0)unlocked++;return {...p,unlocked,completed:p.stars.filter(n=>n>0).length,totalStars:p.stars.reduce((a,b)=>a+b,0)};}
function record(s,meta,won){if(!meta||!config(meta.level)||meta.level>snapshot(s).unlocked)return 0;const count=stars(meta.level,meta,won);if(!count)return 0;const p=state(s);p.stars[meta.level-1]=Math.max(p.stars[meta.level-1],count);let bonus=0;if(p.stars.every(n=>n>0)&&!p.bonusClaimed){bonus=finalReward;p.bonusClaimed=true;s.coins+=bonus;}s.memoryCampaign=p;return bonus;}
const api={levels,finalReward,config,stars,snapshot,record};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaMemoryCampaign=api;
})(typeof window!=='undefined'?window:globalThis);
