import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeConvertedGroup,fitGroupText,activeConvertedGroups} from '../src/converted-groups.js';
import {selectRecognitionStrokes} from '../src/recognition-selection.js';

const source=readFileSync('src/app.js','utf8'),plain=value=>JSON.parse(JSON.stringify(value));
const stroke=(id,x,y,w)=>({id,width:3,points:[{x,y},{x:x+w,y:y+30}]});
const raw=[stroke('row1',100,180,650),stroke('row2left',100,240,200),stroke('row2right',340,240,410)];
const first=makeConvertedGroup(raw.slice(0,2),'First sentence fills its own row\nLeft part',{id:'first',font:'Gaegu',fontSize:32}),second=makeConvertedGroup(raw.slice(2),'Right continuation',{id:'second',font:'PoorStory',fontSize:24});
function layoutHarness(strokes=raw){
  const metrics={font:'32px Test',measureText(text){return {width:Array.from(text).length*Number.parseFloat(this.font)*.56};}};
  const scope={fitGroupText,layoutCache:new Map(),metrics,note:{id:'page',font:'NanumPenScript',fontSize:40,strokes},groupFont:g=>g.font,
    deriveInkRows(){throw Error('Durable objects must not derive layout from old ink');},distributeTextAcrossRows(){throw Error('Conversion must not be split into derived rows');}};
  vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function groupLayout('),source.indexOf('function renderInk(')),scope);return scope;
}
function snapshot(strokes,groups=[first]){
  const scope={note:{id:'page',font:'Gaegu',fontSize:32,strokes,convertedGroups:groups},drawing:null,inkRevision:1,activeConvertedGroups,selectRecognitionStrokes,structuredClone};
  vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function recognitionSnapshot('),source.indexOf('function selectedRecognitionSnapshot(')),scope);return scope.recognitionSnapshot();
}

test('actual layout uses one owned paragraph box for the full conversion and keeps later events separate',()=>{
  const h=layoutHarness(),a=h.groupLayout(first),b=h.groupLayout(second);
  assert.equal(a.rows.length,1);assert.equal(b.rows.length,1);
  assert.deepEqual(plain(a.rows[0].bounds),first.bounds);assert.deepEqual(plain(b.rows[0].bounds),second.bounds);
  assert.equal(a.rows[0].text,first.text);assert.equal(b.rows[0].text,second.text);
  assert.deepEqual(plain(a.rows[0].lines),['First sentence fills its own row','Left part']);
  assert.equal(a.ambiguous,false);assert.equal(b.ambiguous,false);
});

test('removing or changing every source stroke cannot relocate or reflow a durable object',()=>{
  const h=layoutHarness(),before=plain(h.groupLayout(first));
  for(const strokes of [[],raw.slice(0,1),raw.map(s=>({...s,points:s.points.map(p=>({x:p.x/2,y:p.y+400}))})),[stroke('unrelated',30,50,20)]]){
    h.note.strokes=strokes;h.layoutCache.clear();assert.deepEqual(plain(h.groupLayout(first)),before);
  }
});

test('owned moved bounds, not remembered source geometry, determine the next rendered position',()=>{
  const h=layoutHarness(),moved={...first,bounds:{...first.bounds,x:first.bounds.x+30,y:first.bounds.y+80}};
  const row=h.groupLayout(moved).rows[0];assert.deepEqual(plain(row.bounds),moved.bounds);assert.equal(row.text,first.text);
  const secondBounds=h.groupLayout(second).rows[0].bounds;assert.deepEqual(plain(secondBounds),second.bounds);assert.notEqual(secondBounds,second.bounds);
});

test('new writing inside an earlier conversion reads only new ink and never silently replaces its full text',()=>{
  const extra=stroke('late',110,245,20),result=snapshot([...raw.slice(0,2),extra]);
  assert.equal(result.revisited,false);assert.deepEqual(plain(result.strokes.map(s=>s.id)),['late']);
  assert.equal(result.baseText,first.text);assert.equal(first.text,'First sentence fills its own row\nLeft part');
});

test('inserting a nonoverlapping sentence before existing ink does not resend the earlier object source',()=>{
  const earlier=stroke('earlier',100,90,500),result=snapshot([...raw.slice(0,2),earlier]);
  assert.deepEqual(plain(result.strokes.map(s=>s.id)),['earlier']);assert.equal(result.baseText,first.text);
});

test('empty space inside a broad multiline object remains new ink without reinterpreting old lines',()=>{
  const extra=stroke('space',400,245,100),result=snapshot([...raw.slice(0,2),extra]);
  assert.equal(result.revisited,false);assert.deepEqual(plain(result.strokes.map(s=>s.id)),['space']);assert.equal(result.baseText,first.text);
});

test('a source-less prior object remains in recognition base text when later writing begins',()=>{
  const result=snapshot([stroke('new',100,400,150)]);
  assert.deepEqual(plain(result.strokes.map(s=>s.id)),['new']);assert.equal(result.baseText,first.text);
});

test('bounded visual preview reports overflow without truncating durable stored content',()=>{
  const text='한글😀\n'.repeat(800),group={...first,text},h=layoutHarness([]),before=structuredClone(group);
  const layout=h.groupLayout(group);assert.equal(layout.rows.length,1);assert.equal(layout.overflow,true);
  assert.deepEqual(group,before);assert.equal(group.text,text);assert.deepEqual(plain(layout.rows[0].bounds),group.bounds);
});
