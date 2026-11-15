/* Local decoration search and stock filters; no mutations or storage access. */
(function(root){'use strict';
const aliases={
 'fern-pot':'fern plant папоротник растение цветок',
 'flower-vase':'flower flowers vase цветы цветок ваза букет',
 'paw-picture':'paw picture portrait painting картина портрет лапа',
 'golden-picture':'gold golden paw picture portrait золотой золотая картина портрет',
 'shell-vase':'shell sea seashell vase ракушка раковина морская ваза',
 'ocean-picture':'ocean sea picture print море океан морская картина',
 'lavender-pot':'lavender plant pot лаванда растение горшок цветок',
 'moon-picture':'moon stars picture луна звезды картина',
 'tulip-vase':'tulip tulips bouquet vase тюльпан тюльпаны букет ваза цветы',
 'rose-pot':'rose roses plant pot роза розы растение цветы горшок'
};
const themes={'seaside':'seaside bathroom морская ванная','cozy-bedroom':'cozy bedroom уютная спальня','bloom-garden':'blooming garden цветущий сад'},types={plant:'plant растение горшок',vase:'vase ваза букет',picture:'picture картина портрет'};
function normalize(v){return String(v??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[’']/g,'').replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();}
function filter(catalog,world,options={}){const tokens=normalize(String(options.query??'').slice(0,80)).split(' ').filter(Boolean),stock=world?.decorInventory||{},placements=world?.decorPlacements||[];return catalog.filter(item=>{if(item.category!=='Decor')return false;const total=stock[item.id]||0,placed=placements.filter(p=>p.itemId===item.id);if(options.inventoryOnly&&total<1||options.set&&options.set!=='all'&&item.setId!==options.set)return false;if(options.stock==='owned'&&total<1||options.stock==='available'&&total<=placed.length||options.stock==='here'&&!placed.some(p=>p.room===world.room))return false;const text=normalize(item.id+' '+item.name+' '+item.slot+' '+(Object.hasOwn(types,item.slot)?types[item.slot]:'')+' '+(Object.hasOwn(themes,item.setId)?themes[item.setId]:'')+' '+(Object.hasOwn(aliases,item.id)?aliases[item.id]:''));return tokens.every(t=>text.includes(t));});}
const api={normalize,filter};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaDecorLibrary=api;
})(typeof window!=='undefined'?window:globalThis);
