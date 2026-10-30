import test from 'node:test';
import assert from 'node:assert/strict';
import {DRAWING_TYPES,createDrawingObject,eraseDrawingObjects} from '../src/drawing-objects.js';
const p=(x,y)=>({x,y});
const make=(type='rectangle',extra={})=>createDrawingObject(type,p(100,100),p(300,300),{id:type,width:2,...extra});

test('every drawing type can be erased as a whole object without mutating the source',()=>{
 for(const type of DRAWING_TYPES){const o=make(type),before=structuredClone(o),result=eraseDrawingObjects([o],p(200,200),p(200,200),5);assert.equal(result.changed,true,type);assert.deepEqual(result.objects,[]);assert.deepEqual(result.removedIds,[o.id]);assert.deepEqual(o,before);}
});
test('fast sweep crosses objects even when both input points are outside',()=>{
 const objects=[make('rectangle'),createDrawingObject('table',p(400,100),p(600,300),{id:'table',rows:2,cols:2,cells:[['가','나'],['다','라']]})],before=structuredClone(objects);
 const result=eraseDrawingObjects(objects,p(0,200),p(700,200),4);assert.deepEqual(result.removedIds,['rectangle','table']);assert.deepEqual(result.objects,[]);assert.deepEqual(objects,before);
});
test('nearby untouched objects keep their identity and table contents',()=>{
 const a=make(),b=createDrawingObject('table',p(400,400),p(600,600),{id:'other',rows:1,cols:1,cells:[['보존']]});const result=eraseDrawingObjects([a,b],p(150,150),p(150,150),5);assert.deepEqual(result.removedIds,[a.id]);assert.equal(result.objects[0],b);assert.equal(b.cells[0][0],'보존');
});
test('diagonal line is not erased by a sweep through empty space in its bounding box',()=>{const objects=[make('line')];const result=eraseDrawingObjects(objects,p(110,250),p(150,290),5);assert.equal(result.objects,objects);assert.equal(result.changed,false);});
test('arrowhead outside the endpoint bounding box is still erased',()=>{const o=createDrawingObject('arrow',p(100,200),p(300,200),{id:'arrow',width:2});assert.equal(eraseDrawingObjects([o],p(278,211),p(278,211),1).changed,true);});
test('empty bounding-box corners of an ellipse, triangle and diamond are not erased',()=>{for(const type of ['ellipse','triangle','diamond']){const objects=[make(type)];assert.equal(eraseDrawingObjects(objects,p(105,105),p(105,105),2).objects,objects,type);}});
test('eraser radius and drawn outline width both count at the edge',()=>{const objects=[make()];assert.equal(eraseDrawingObjects(objects,p(95,200),p(95,200),3).changed,false);assert.equal(eraseDrawingObjects(objects,p(95,200),p(95,200),4).changed,true);});
test('object labels can be erased together with their parent even away from a line',()=>{const o=make('line',{text:'label'});assert.equal(eraseDrawingObjects([o],p(200,110),p(200,110),2).changed,true);});
test('invalid inputs and repeated deletion are safe no-ops',()=>{const objects=[make()];for(const radius of [0,-1,NaN,Infinity])assert.equal(eraseDrawingObjects(objects,p(200,200),p(200,200),radius).objects,objects);assert.equal(eraseDrawingObjects(objects,p(NaN,200)).objects,objects);assert.equal(eraseDrawingObjects([],p(200,200)).changed,false);assert.throws(()=>eraseDrawingObjects([objects[0],objects[0]],p(200,200)));});
