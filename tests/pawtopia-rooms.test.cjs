/* Pawtopia 3.1 asset and 12-layout preflight. Run: node --test tests/pawtopia-rooms.test.cjs */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const rooms=['F958EAAC-B020-4970-BDBC-477AE9764AC6','Kitchen','Bedroom','Bathroom','Garden'];
const stages=['Baby','Puppy','Adult'];
const sprites={Baby:'508DBCDC-81F6-4929-9585-F14474462DA0.png',Puppy:'67568E86-533A-455C-947D-09DAA4AF27ED.png',Adult:'6A967E6E-5DCA-42B8-9F7B-C9ECFE8B51F6.png'};
function png(file){
 const b=fs.readFileSync(file);
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature');
 const w=b.readUInt32BE(16),h=b.readUInt32BE(20),type=b[25];
 assert.ok(w>0&&h>0,'nonempty image');
 assert.ok(type===4||type===6,'transparent PNG must use grayscale+alpha or RGBA');
 return {w,h,type};
}
for(const room of rooms)test(room+' original background exists',()=>{
 const file=path.join(root,'assets','rooms',room+'.png');
 assert.ok(fs.existsSync(file),file);const p=pngBackground(file);
 assert.ok(p.w>0&&p.h>0);
});
function pngBackground(file){const b=fs.readFileSync(file);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)}}
for(const stage of stages)test(stage+' original transparent sprite exists',()=>{
 const file=path.join(root,'assets','rooms','jerry',sprites[stage]);
 assert.ok(fs.existsSync(file),'Missing '+file);png(file);
});
for(const room of rooms)for(const stage of stages)test(room+' / '+stage+' sprite and room assets',()=>{
 const bg=path.join(root,'assets','rooms',room+'.png'),sprite=path.join(root,'assets','rooms','jerry',sprites[stage]);
 assert.ok(fs.existsSync(bg),'Missing '+bg);
 assert.ok(fs.existsSync(sprite),'Missing '+sprite);
 png(sprite);
});
test('living room source remains present',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/id="scene"/);
 assert.match(html,/id="portrait"/);
});
test('five mini games remain in game logic',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const name of ['bone','ball','treasure','jump','puzzle'])assert.ok(html.includes("'"+name+"'"),'Missing '+name);
});
