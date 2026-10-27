import test from 'node:test';
import assert from 'node:assert/strict';
import {eraseStrokes} from '../src/area-eraser.js';
const p=(x,y=0,pressure=.5)=>({x,y,pressure});
const s=(points,id='original')=>({id,points,width:2,color:'#112233'});
let sequence=0;const options={idFactory:()=>`fragment_${++sequence}`};
const erase=(strokes,a,b,r,opts=options)=>eraseStrokes(strokes,a,b,r,opts);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ~= ${b}`);
test('two outside endpoints split at exact disk boundaries, pressure interpolation',()=>{
 const original=s([p(-10,0,0),p(10,0,1)]),snapshot=structuredClone(original);
 const r=erase([original],p(0),p(0),3);
 assert.deepEqual(original,snapshot);assert.equal(r.strokes.length,2);
 assert.deepEqual(r.removedIds,['original']);assert.deepEqual(r.replacements,[{sourceId:'original',fragmentIds:r.strokes.map(s=>s.id)}]);
 near(r.strokes[0].points.at(-1).x,-3);near(r.strokes[1].points[0].x,3);
 near(r.strokes[0].points.at(-1).pressure,.35);near(r.strokes[1].points[0].pressure,.65);
 assert.equal(r.strokes[0].color,original.color);
});
test('fast drag uses full capsule not two end circles',()=>{
 const r=erase([s([p(0,-20),p(0,20)])],p(-100),p(100),4);
 assert.equal(r.strokes.length,2);near(r.strokes[0].points.at(-1).y,-4);near(r.strokes[1].points[0].y,4);
});
test('capsule endpoint circle is clipped',()=>{
 const r=erase([s([p(-10,-10),p(-10,10)])],p(-8),p(8),3);
 near(r.strokes[0].points.at(-1).y,-Math.sqrt(5));near(r.strokes[1].points[0].y,Math.sqrt(5));
});
test('single point inside deletes, outside and tangent remain',()=>{
 for(const [x,changed] of [[0,true],[2,false],[3,false]])assert.equal(erase([s([p(x)])],p(0),p(0),2).changed,changed);
});
test('tangent segment is unchanged with same object references',()=>{
 const strokes=[s([p(-10,3),p(10,3)])];const r=erase(strokes,p(0),p(0),3);
 assert.equal(r.changed,false);assert.equal(r.strokes,strokes);
});
test('invalid or zero radius and NaN coordinates are safe no-op',()=>{
 const strokes=[s([p(-10),p(10)])];
 for(const radius of [0,-1,NaN,Infinity])assert.equal(erase(strokes,p(0),p(0),radius).strokes,strokes);
 assert.equal(erase(strokes,p(NaN),p(0),3).changed,false);
});
test('whole stroke deleted; isolated internal vertices do not survive',()=>{
 const r=erase([s([p(-1),p(0),p(1)])],p(0),p(0),3);assert.deepEqual(r.strokes,[]);
});
test('untouched original vertices and metadata are preserved',()=>{
 const points=[p(-20,4),p(-10),p(0),p(10),p(20,7)];
 const r=erase([s(points)],p(0),p(0),2);
 assert.deepEqual(r.strokes[0].points.slice(0,2),points.slice(0,2));assert.deepEqual(r.strokes[1].points.slice(-2),points.slice(-2));
});
test('repeated call maps current fragment IDs, no collisions or source mutation',()=>{
 const original=[s([p(-20),p(20)])],snapshot=structuredClone(original);
 const first=erase(original,p(0),p(0),2),second=erase(first.strokes,p(-10),p(-10),2);
 assert.deepEqual(second.removedIds,[first.strokes[0].id]);assert.equal(second.strokes.length,3);
 assert.equal(new Set([...first.strokes,...second.strokes.filter(s=>s.id!==first.strokes[1].id)].map(s=>s.id)).size,4);
 assert.deepEqual(original,snapshot);
});
test('repeated identical erase is no-op and stable IDs',()=>{
 const first=erase([s([p(-20),p(20)])],p(0),p(0),3);
 const second=erase(first.strokes,p(0),p(0),3);assert.equal(second.changed,false);assert.equal(second.strokes,first.strokes);
});
test('zero length duplicate segments work inside and outside',()=>{
 assert.equal(erase([s([p(0),p(0)])],p(0),p(0),3).strokes.length,0);
 assert.equal(erase([s([p(10),p(10)])],p(0),p(0),3).changed,false);
});
test('width padding optionally keeps round caps clear',()=>{
 const r=erase([s([p(-10),p(10)])],p(0),p(0),3,{...options,includeStrokeWidth:true});near(r.strokes[0].points.at(-1).x,-4);
});
test('duplicate IDs and invalid points reject atomically',()=>{
 assert.throws(()=>erase([s([p(NaN)])],p(0),p(0),3),TypeError);
 assert.throws(()=>erase([s([p(0)]),s([p(0)])],p(0),p(0),3),TypeError);
 assert.throws(()=>erase([s([p(-10),p(10)])],p(0),p(0),3,{idFactory:()=> 'original'}),TypeError);
});
test('diagonal capsule has exact perpendicular crossing',()=>{
 const r=erase([s([p(-10,10),p(10,-10)])],p(-10,-10),p(10,10),Math.sqrt(2));
 near(r.strokes[0].points.at(-1).x,-1);near(r.strokes[1].points[0].x,1);
});
test('multiple crossings produce all outside islands',()=>{
 const r=erase([s([p(-10),p(10),p(-10)])],p(0),p(0),2);
 assert.equal(r.strokes.length,3);assert.deepEqual(r.strokes.map(s=>s.points.map(p=>p.x)),[[-10,-2],[2,10,2],[-2,-10]]);
});
test('seeded randomized capsule clipping matches dense point-distance reference',()=>{
 let seed=98271;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 const distance=(p,a,b)=>{const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y)};
 for(let n=0;n<200;n++){
 const a=p(rand()*100,rand()*100),b=p(rand()*100,rand()*100),u=p(rand()*100,rand()*100),v=p(rand()*100,rand()*100),radius=1+rand()*20;
 const result=erase([s([u,v])],a,b,radius),whole=Math.hypot(v.x-u.x,v.y-u.y);
 let exact=0;for(const fragment of result.strokes)for(let i=1;i<fragment.points.length;i++)exact+=Math.hypot(fragment.points[i].x-fragment.points[i-1].x,fragment.points[i].y-fragment.points[i-1].y);
 let outside=0;const steps=2000;
 for(let i=0;i<steps;i++){const t=(i+.5)/steps;if(distance(p(u.x+(v.x-u.x)*t,u.y+(v.y-u.y)*t),a,b)>=radius)outside++;}
 assert.ok(Math.abs(exact-whole*outside/steps)<=whole*3/steps+1e-7);
 for(const fragment of result.strokes)for(const point of fragment.points)assert.ok(distance(point,a,b)>=radius-1e-7);
 }
});
