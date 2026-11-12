const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../game-engine.js');
test('legacy Bone Catch still ends at 30 seconds and rewards 1 coin per 5 points',()=>{const g=E.create('bone');E.start(g);g.score=28;E.tick(g,30);assert.equal(g.status,'over');assert.equal(E.reward(g),5);});
