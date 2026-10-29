import test from 'node:test';
import assert from 'node:assert/strict';
import {blankPaperPoint} from '../src/touch-hit.js';
import {createDrawingObject} from '../src/drawing-objects.js';
import {maxStrokeRadius} from '../src/pen-renderer.js';
const stroke=(points,extra={})=>({id:'raw',width:3,color:'#223247',points,...extra});
const note=(strokes=[],drawingObjects=[])=>({strokes,drawingObjects,showOriginal:false});
const shape=(type='rectangle',from={x:300,y:400},to={x:600,y:700},extra={})=>createDrawingObject(type,from,to,{id:'drawing',...extra});

test('empty paper accepts finite local geometry but rejects missing or non-finite pointer positions',()=>{
 assert.equal(blankPaperPoint(note(),{x:450,y:600}),true);assert.equal(blankPaperPoint(note(),{x:0,y:0}),true);
 for(const p of [null,undefined,{}, {x:NaN,y:0},{x:0,y:Infinity},{x:'10',y:20}])assert.equal(blankPaperPoint(note(),p),false);
});
test('raw line hit uses segment geometry not its entire diagonal bounding box',()=>{
 const n=note([stroke([{x:100,y:100},{x:400,y:400}])]);assert.equal(blankPaperPoint(n,{x:250,y:250},[],0),false);assert.equal(blankPaperPoint(n,{x:100,y:400},[],0),true);
 assert.equal(blankPaperPoint(n,{x:250,y:265},[],12),false);assert.equal(blankPaperPoint(n,{x:250,y:280},[],12),true);
});
test('single dots repeated points and multisegment paths exclude their visible stroke width',()=>{
 const dot=note([stroke([{x:100,y:100}],{width:10})]);assert.equal(blankPaperPoint(dot,{x:105,y:100},[],0),false);assert.equal(blankPaperPoint(dot,{x:106,y:100},[],0),true);
 const repeated=note([stroke([{x:100,y:100},{x:100,y:100}])]);assert.equal(blankPaperPoint(repeated,{x:100,y:100},[],0),false);
 const corner=note([stroke([{x:100,y:100},{x:300,y:100},{x:300,y:300}])]);assert.equal(blankPaperPoint(corner,{x:300,y:200}),false);assert.equal(blankPaperPoint(corner,{x:200,y:200}),true);
});
test('pen pressure/material widths conservatively protect visible highlighter fountain and marker edges',()=>{
 for(const penKind of ['highlighter','fountain','marker','pencil','colored-pencil','ballpoint']){const ink=stroke([{x:100,y:100,pressure:1},{x:400,y:100,pressure:1}],{width:15,penKind}),n=note([ink]),radius=maxStrokeRadius(ink);assert.equal(blankPaperPoint(n,{x:250,y:100+radius},[],0),false,penKind);assert.equal(blankPaperPoint(n,{x:250,y:100+radius+13},[],12),true,penKind);}
 const highlighter=note([stroke([{x:100,y:100},{x:400,y:100}],{width:15,penKind:'highlighter'})]);assert.equal(blankPaperPoint(highlighter,{x:250,y:121},[],12),false);
});
test('visible text targets exclude their full independent bounds plus caller-provided padding',()=>{
 const target={groupId:'text',strokeIds:[],bounds:{x:100,y:200,width:250,height:100}};
 assert.equal(blankPaperPoint(note(),{x:150,y:250},[target]),false);assert.equal(blankPaperPoint(note(),{x:88,y:250},[target],12),false);assert.equal(blankPaperPoint(note(),{x:87,y:250},[target],12),true);
 assert.equal(blankPaperPoint(note(),{x:400,y:600},[target]),true);
});
test('hidden provenance ink permits navigation away from moved visible text; original view restores raw protection',()=>{
 const n=note([stroke([{x:100,y:100},{x:200,y:100}]),stroke([{x:100,y:500},{x:200,y:500}],{id:'unconverted'})]),target={groupId:'converted',strokeIds:['raw'],bounds:{x:600,y:700,width:200,height:100}},before=structuredClone(n);
 assert.equal(blankPaperPoint(n,{x:150,y:100},[target]),true);assert.equal(blankPaperPoint(n,{x:150,y:500},[target]),false);assert.equal(blankPaperPoint(n,{x:650,y:750},[target]),false);
 assert.equal(blankPaperPoint({...n,showOriginal:true},{x:150,y:100},[]),false);assert.deepEqual(n,before);
});
test('drawing shapes and tables exclude their editable area without changing saved object data',()=>{
 for(const type of ['rectangle','ellipse','triangle','diamond','table']){const n=note([], [shape(type)]),before=structuredClone(n);assert.equal(blankPaperPoint(n,{x:450,y:550}),false,type);assert.equal(blankPaperPoint(n,{x:288,y:550},[],12),false,type);assert.equal(blankPaperPoint(n,{x:270,y:550}),true,type);assert.deepEqual(n,before);}
});
test('line and arrow empty bounding-box corners stay blank but visible shafts remain protected',()=>{
 for(const type of ['line','arrow']){const n=note([], [shape(type,{x:100,y:100},{x:400,y:400})]);assert.equal(blankPaperPoint(n,{x:250,y:250},[],0),false,type);assert.equal(blankPaperPoint(n,{x:110,y:390},[],0),true,type);assert.equal(blankPaperPoint(n,{x:400,y:400},[],12),false,type);}
});
test('empty raw strokes are harmless and hidden-source IDs do not accidentally hide unrelated strokes',()=>{
 const n=note([stroke([]),stroke([{x:500,y:500}],{id:'other'})]),targets=[{strokeIds:['raw'],bounds:{x:100,y:100,width:100,height:100}}];assert.equal(blankPaperPoint(n,{x:500,y:500},targets),false);assert.equal(blankPaperPoint(n,{x:700,y:700},targets),true);
});
test('weak cached bounds avoid rescanning untouched large strokes for distant touches',()=>{
 let reads=0;const points=Array.from({length:1000},(_,i)=>({get x(){reads++;return i%100},get y(){reads++;return Math.floor(i/100)}})),s=stroke(points),n=note([s]);
 assert.equal(blankPaperPoint(n,{x:800,y:1100}),true);const firstReads=reads;assert.ok(firstReads>=points.length*2);for(let i=0;i<25;i++)assert.equal(blankPaperPoint(n,{x:800,y:1100}),true);assert.equal(reads,firstReads);
 const moved={...s,points:[{x:800,y:1100}]};assert.equal(blankPaperPoint(note([moved]),{x:800,y:1100}),false);assert.equal(blankPaperPoint(n,{x:800,y:1100}),true);
});
