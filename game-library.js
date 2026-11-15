/* Search metadata does not read or change player progress. */
(function(root){'use strict';
const groups={
 blast:['puzzles','block puzzle blocks garden блоки блок сад'],
 memory:['puzzles','pairs cards matching память пары карточки'],
 treasure:['puzzles','treasures hunt dig сокровища поиск клад'],
 puzzle:['puzzles','jigsaw picture jerry пазл пазлы картинка джерри'],
 merge:['puzzles','2048 numbers merge цифры числа'],
 bubbles:['puzzles','bubble shooter bubbles пузырьки пузыри шарики'],
 sort:['puzzles','water color sort colors сортировка цвета пробирки'],
 maze:['puzzles','jerrys maze labyrinth лабиринт джерри'],
 match:['puzzles','match 3 match3 candy три в ряд конфеты'],
 bone:['arcade','catch bones кости косточки'],
 ball:['arcade','runner ball run мяч мячи бег'],
 jump:['arcade','jump platform adventure прыжки прыгать'],
 treats:['arcade','treat reaction time реакция лакомства'],
 blocks:['arcade','tetris falling blocks тетрис'],
 snake:['arcade','snake змейка змея'],
 moles:['arcade','whack a mole крот кроты']
};
function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[’']/g,'').replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();}
function category(kind){return Object.hasOwn(groups,kind)?groups[kind][0]:'other';}
function filter(catalog,options={}){const group=['all','puzzles','arcade'].includes(options.category)?options.category:'all',tokens=normalize(String(options.query??'').slice(0,80)).split(' ').filter(Boolean),favorites=new Set(Array.isArray(options.favorites)?options.favorites:[]);return Object.keys(catalog).filter(kind=>{if(group!=='all'&&category(kind)!==group||options.favoritesOnly&&!favorites.has(kind))return false;const extra=Object.hasOwn(groups,kind)?groups[kind][1]:'',text=normalize(kind+' '+(catalog[kind].name||'')+' '+extra);return tokens.every(t=>text.includes(t));});}
const api={category,filter,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PawtopiaGameLibrary=api;
})(typeof window!=='undefined'?window:globalThis);
