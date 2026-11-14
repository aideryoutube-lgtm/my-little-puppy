/* Pure instance inventory and room placement rules; coordinates are scene percentages. */
(function(root){'use strict';
const zones={
 living:{wall:[[22,8,78,31]],surface:[[22,25,75,34],[73,46,97,89]]},
 kitchen:{wall:[[55,24,75,31]],surface:[[23,22,75,39],[73,48,97,62]]},
 bedroom:{wall:[[45,8,78,30]],surface:[[22,21,52,35],[73,47,97,88]]},
 bathroom:{wall:[[53,27,73,39]],surface:[[22,25,78,36],[73,43,97,88]]},
 garden:{wall:[[29,27,70,37]],surface:[[73,47,97,89]]}
};
const sizes={plant:[13,14],vase:[9,10],picture:[12,10]};
const defaults={living:{plant:[85,66],vase:[78,29],picture:[35,21]},kitchen:{plant:[59,37],vase:[40,35],picture:[64,30]},bedroom:{plant:[84,64],vase:[47,34],picture:[60,20]},bathroom:{plant:[83,65],vase:[27,35],picture:[63,38]},garden:{plant:[84,64],vase:[79,55],picture:[50,36]}};
function dimensions(item,room){const a=item.decorSize||(item.slot==='picture'&&room==='kitchen'?[10,6]:item.slot==='picture'&&room==='garden'?[12,8]:sizes[item.slot])||[12,12];return {width:a[0],height:a[1]};}
function bounds(item,p){const d=dimensions(item,p.room);return [p.x-d.width/2,p.y-d.height,p.x+d.width/2,p.y];}
function overlaps(a,b){return a[0]<b[2]-.05&&a[2]>b[0]+.05&&a[1]<b[3]-.05&&a[3]>b[1]+.05;}
function area(item){return item.placementType||(item.slot==='picture'?'wall':'surface');}
function valid(item,room,p,extra=[]){if(!item||!zones[room]||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;const b=bounds(item,{...p,room}),reserved=[[0,0,100,7],[0,94,100,100],[0,34,20,94],[29,40,71,94],...extra];return (zones[room][area(item)]||zones[room].surface).some(z=>b[0]>=z[0]&&b[1]>=z[1]&&b[2]<=z[2]&&b[3]<=z[3])&&!reserved.some(z=>overlaps(b,z));}
function nearest(item,room,p,extra=[]){if(!zones[room])return null;const d=dimensions(item,room);let best=null,dist=Infinity;for(const z of zones[room][area(item)]||zones[room].surface){for(let y=z[1]+d.height;y<=z[3]+.001;y+=1)for(let x=z[0]+d.width/2;x<=z[2]-d.width/2+.001;x+=1){const q={x:Math.round(x*100)/100,y:Math.round(y*100)/100};const dd=(x-p.x)**2+(y-p.y)**2;if(dd<dist&&valid(item,room,q,extra)){best=q;dist=dd;}}}return best;}
function defaultPoint(item,room){const p=defaults[room]?.[item.slot]||[84,65];return nearest(item,room,{x:p[0],y:p[1]});}
function sync(w,catalog){w.decor={};for(const p of w.decorPlacements){const item=catalog.find(i=>i.id===p.itemId);if(!item)continue;w.decor[p.room]=w.decor[p.room]||{};w.decor[p.room][item.slot]=p.itemId;}}
function counts(w,id){const total=w.decorInventory[id]||0,placed=w.decorPlacements.filter(p=>p.itemId===id).length;return {total,placed,available:Math.max(0,total-placed)};}
function migrate(w,catalog,rooms){const items=catalog.filter(i=>i.category==='Decor'),ids=new Set(items.map(i=>i.id));let inventory={};for(const item of items){const n=w.decorInventory&&w.decorInventory[item.id];inventory[item.id]=Number.isSafeInteger(n)&&n>=0?n:(w.owned.includes(item.id)?1:0);}
const result=[];let serial=Number.isSafeInteger(w.decorSerial)&&w.decorSerial>=0?w.decorSerial:0;const seen=new Set();
if(w.decorVersion!==2){for(const room of rooms)for(const id of Object.values(w.decor?.[room]||{})){const item=items.find(i=>i.id===id);if(!item||!w.owned.includes(id))continue;const p=defaultPoint(item,room);if(p)result.push({instanceId:'decor-'+(++serial),itemId:id,room,...p});}for(const item of items)inventory[item.id]=Math.max(inventory[item.id],result.filter(p=>p.itemId===item.id).length);}
else for(const old of Array.isArray(w.decorPlacements)?w.decorPlacements:[]){if(!old||!ids.has(old.itemId)||!rooms.includes(old.room)||typeof old.instanceId!=='string'||seen.has(old.instanceId))continue;const item=items.find(i=>i.id===old.itemId),p=valid(item,old.room,old)?{x:old.x,y:old.y}:defaultPoint(item,old.room);if(!p)continue;const used=result.filter(p=>p.itemId===old.itemId).length;if(used>=inventory[old.itemId])continue;result.push({instanceId:old.instanceId,itemId:old.itemId,room:old.room,...p});seen.add(old.instanceId);const n=/^decor-(\d+)$/.exec(old.instanceId);if(n)serial=Math.max(serial,Number(n[1]));}
w.decorVersion=2;w.decorInventory=inventory;w.decorPlacements=result;w.decorSerial=serial;for(const [id,n]of Object.entries(inventory))if(n>0&&!w.owned.includes(id))w.owned.push(id);sync(w,catalog);return w;}
function add(w,id){w.decorInventory[id]=(w.decorInventory[id]||0)+1;if(!w.owned.includes(id))w.owned.push(id);}
function place(w,item,room,p,catalog){if(counts(w,item.id).available<1)return {ok:false,message:'All copies are placed. Move one here or buy another.'};if(!valid(item,room,p))return {ok:false,message:'Choose a suitable wall or surface, clear of Jerry and the controls.'};const placement={instanceId:'decor-'+(++w.decorSerial),itemId:item.id,room,x:p.x,y:p.y};w.decorPlacements.push(placement);sync(w,catalog);return {ok:true,message:item.name+' placed.',instanceId:placement.instanceId};}
function move(w,value,catalog){const p=w.decorPlacements.find(p=>p.instanceId===value?.instanceId),item=p&&catalog.find(i=>i.id===p.itemId);if(!p||p.room!==w.room)return {ok:false,message:'Decoration is no longer in this room.'};if(!valid(item,p.room,value))return {ok:false,message:'Choose a suitable wall or surface, clear of Jerry and the controls.'};p.x=value.x;p.y=value.y;sync(w,catalog);return {ok:true,message:'Decoration position saved.'};}
function remove(w,id,catalog){const i=w.decorPlacements.findIndex(p=>p.instanceId===id&&p.room===w.room);if(i<0)return {ok:false,message:'Decoration is no longer in this room.'};w.decorPlacements.splice(i,1);sync(w,catalog);return {ok:true,message:'Decoration returned to your inventory.'};}
const api={zones,dimensions,bounds,valid,nearest,defaultPoint,migrate,counts,add,place,move,remove,sync};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaDecorRules=api;
})(typeof window!=='undefined'?window:globalThis);
