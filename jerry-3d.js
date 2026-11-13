/* Uploaded Puppy model, isolated to the test branch. No save or growth changes. */
(()=>{'use strict';
const scene=document.getElementById('scene'),api=window.pawtopiaWorld;
let preview=false,ready=false,failed=false;
const button=document.createElement('button');button.id='jerry3DToggle';button.type='button';button.textContent='View 3D Jerry';button.setAttribute('aria-pressed','false');
document.getElementById('roomNav').after(button);
const viewer=document.createElement('model-viewer');viewer.id='jerry3D';viewer.alt='Jerry Puppy — uploaded 3D model';
for(const [k,v] of Object.entries({src:'assets/models/Jerry_Puppy.glb','camera-controls':'','disable-zoom':'','disable-pan':'','touch-action':'pan-y','shadow-intensity':'0.8',exposure:'1','camera-orbit':'0deg 75deg 105%','interaction-prompt':'none'}))viewer.setAttribute(k,v);
viewer.hidden=true;scene.prepend(viewer);
const label=document.createElement('span');label.id='jerry3DStatus';label.setAttribute('role','status');button.after(label);
function active(){return !failed&&(preview||scene.dataset.growthStage==='Puppy');}
function sync(){const on=active();viewer.hidden=!on;scene.classList.toggle('jerry-3d-ready',on&&ready);document.getElementById('roomCanvas').classList.toggle('jerry-3d-ready',on&&ready);button.textContent=preview?'Return to growth stage':'View 3D Jerry';button.setAttribute('aria-pressed',String(preview));label.textContent=on?(failed?'3D could not load.':ready?(preview?'Puppy 3D preview · drag to rotate':'Puppy 3D · drag to rotate'):'Loading Jerry 3D…'):failed?'3D unavailable. Original Jerry is shown.':'';}
window.pawtopia3D={active};
viewer.addEventListener('load',()=>{ready=true;sync();if(active())api.stop();});
viewer.addEventListener('error',()=>{failed=true;ready=false;sync();api.restore();});
button.onclick=()=>{preview=!preview;failed=false;api.stop();sync();if(!active())api.restore();};
new MutationObserver(sync).observe(scene,{attributes:true,attributeFilter:['data-growth-stage']});
document.addEventListener('pawtopia-state',sync);sync();
})();
