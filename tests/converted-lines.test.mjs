import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeConvertedLines} from '../src/converted-lines.js';
import {makeConvertedGroup,fitGroupText,validateGroups} from '../src/converted-groups.js';
import {deriveInkRows,distributeTextAcrossRows} from '../src/ink-lines.js';
import {makeNote,parseBackup} from '../src/core.js';
import {moveSelection} from '../src/selection.js';

const stroke=(id,x=100,y=100,width=180)=>({id,width:3,color:'#223247',points:[{x,y},{x:x+width,y:y+25}]});
const fixture=(text='첫째 줄\n둘째 줄',options={})=>{
  const strokes=[stroke('first'),stroke('second',140,180,95)];
  return {strokes,group:makeConvertedGroup(strokes,text,{id:'parent',...options})};
};
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;};
const plain=value=>JSON.parse(JSON.stringify(value));

function actualLayout(note,groups){
  const metrics={font:'32px Gaegu',measureText(text){return {width:Array.from(text).length*Number.parseFloat(this.font)*.56};}};
  const scope={deriveInkRows,distributeTextAcrossRows,fitGroupText,layoutCache:new Map(),metrics,note,groupFont:g=>g.font||note.font};
  const source=readFileSync('src/app.js','utf8');
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function groupLayout('),source.indexOf('function renderInk(')),scope);
  return plain(groups.flatMap(group=>scope.groupLayout(group).rows.map(row=>({bounds:row.bounds,text:row.text,sourceText:row.sourceText,lines:row.lines,font:scope.groupFont(group),fontSize:row.fontSize,lineHeight:row.lineHeight,overflow:row.overflow}))));
}

test('splits exact CRLF and Unicode pieces without mutating strokes or the parent',()=>{
  const {strokes,group}=fixture('한글 😀  첫째  \r\n  둘째 끝',{font:'Gaegu',fontSize:24});
  const groups=freeze([group]),before=structuredClone({strokes,groups});freeze(strokes);
  const result=normalizeConvertedLines(groups,strokes);
  assert.equal(result.length,2);
  assert.deepEqual(result.map(g=>g.text),['한글 😀  첫째  \r\n','  둘째 끝']);
  assert.equal(result.map(g=>g.text).join(''),group.text);
  assert.deepEqual(result.map(g=>g.strokeIds),[['first'],['second']]);
  for(const row of result){assert.equal(row.font,'Gaegu');assert.equal(row.fontSize,24);}
  assert.deepEqual({strokes,groups},before);
  assert.deepEqual(validateGroups(result,strokes),result);
  assert.equal(normalizeConvertedLines(result,strokes),result);
});

test('actual existing render positions, wrapping, fitted font sizes and content are identical',()=>{
  for(const options of [{},{font:'PoorStory',fontSize:40},{font:'custom_'+'a'.repeat(64),fontSize:24}]){
    const {strokes,group}=fixture('긴 첫 문장 ABC 123 😀\r\n둘째 문장',options);
    const note={...makeNote(),strokes,font:'Gaegu',fontSize:32};
    const result=normalizeConvertedLines([group],strokes);
    assert.equal(result.length,2);
    assert.deepEqual(actualLayout(note,result),actualLayout(note,[group]));
    if(!options.font){assert.ok(result.every(g=>!Object.hasOwn(g,'font')&&!Object.hasOwn(g,'fontSize')));}
  }
});

test('moving and restyling one normalized row never changes the other row or its source',()=>{
  const {strokes,group}=fixture('윗줄\n아랫줄',{font:'Gaegu',fontSize:32});
  const groups=normalizeConvertedLines([group],strokes),note={...makeNote(),strokes,convertedGroups:groups,text:group.text};
  const original=structuredClone(note),before=actualLayout(note,groups);
  const moved=moveSelection(note,groups[1].strokeIds,30,12);
  assert.equal(moved.moved,true);
  assert.deepEqual(moved.strokeIds,['second']);
  assert.equal(moved.note.strokes[0],strokes[0]);
  assert.equal(moved.note.convertedGroups[0],groups[0]);
  assert.equal(moved.note.text,note.text);
  const after=actualLayout(moved.note,moved.note.convertedGroups);
  assert.deepEqual(after[0],before[0]);
  assert.deepEqual(after[1],{...before[1],bounds:{...before[1].bounds,x:before[1].bounds.x+30,y:before[1].bounds.y+12}});
  const restyled=moved.note.convertedGroups.map(g=>g.id===groups[1].id?{...g,font:'PoorStory',fontSize:40}:g);
  assert.equal(restyled[0],groups[0]);assert.equal(restyled[0].font,'Gaegu');assert.equal(restyled[1].font,'PoorStory');
  assert.equal(restyled.map(g=>g.text).join(''),group.text);
  assert.deepEqual(note,original);
});

test('JSON backup preserves row provenance, separators and independently chosen font overrides',()=>{
  const {strokes,group}=fixture('첫째\n둘째',{font:'Gaegu',fontSize:24});
  const groups=normalizeConvertedLines([group],strokes);groups[1]={...groups[1],font:'custom_'+'b'.repeat(64),fontSize:40};
  const note={...makeNote(),strokes,convertedGroups:groups,text:group.text};
  const restored=parseBackup(JSON.stringify({version:1,notes:[note]}))[0];
  assert.deepEqual(restored.convertedGroups,groups);assert.deepEqual(restored.strokes,strokes);
  assert.equal(restored.convertedGroups.map(g=>g.text).join(''),group.text);
});

test('single rows, proportional guesses, empty lines and ambiguous geometry stay unchanged',()=>{
  for(const text of ['no explicit separator','one\ntwo\nthree','one\n',' \ntwo','one\rsecond']){
    const {strokes,group}=fixture(text),groups=[group];assert.equal(normalizeConvertedLines(groups,strokes),groups,text);
  }
  for(const strokes of [[stroke('one')],[stroke('one',100,100),stroke('two',100,110)],[{...stroke('one'),points:[{x:100,y:50},{x:200,y:250}]},stroke('two',100,320)],[{...stroke('one'),points:[{x:100,y:100},{x:200,y:100}]},stroke('two',100,180)]]){
    const group=makeConvertedGroup(strokes,'one\ntwo',{id:'parent'}),groups=[group];
    assert.equal(normalizeConvertedLines(groups,strokes),groups);
  }
});

test('missing, malformed, duplicate and shared provenance never splits a group',()=>{
  const {strokes,group}=fixture();
  const cases=[
    {groups:[{...group,id:'<unsafe>'}],strokes},
    {groups:[{...group,id:'a'.repeat(101)}],strokes},
    {groups:[{...group,strokeIds:[]}],strokes},
    {groups:[{...group,strokeIds:['first','first']}],strokes},
    {groups:[{...group,strokeIds:['first','missing']}],strokes},
    {groups:[{...group,strokeIds:['first','bad id']}],strokes},
    {groups:[group],strokes:[...strokes,{...strokes[0]}]},
    {groups:[group,{...group}],strokes},
    {groups:[group,{...group,id:'other'}],strokes},
    {groups:[group],strokes:[strokes[0],{...strokes[1],points:[]}]},
    {groups:[group],strokes:[strokes[0],{...strokes[1],points:[{x:NaN,y:100}]}]},
    {groups:[group],strokes:[strokes[0],{...strokes[1],points:[{x:901,y:200}]}]},
    {groups:[group],strokes:[strokes[0],{...strokes[1],width:0}]},
    {groups:[{...group,bounds:{...group.bounds,x:-1}}],strokes},
    {groups:[{...group,text:'x'.repeat(1001)+'\ny'}],strokes},
  ];
  for(const {groups,strokes}of cases)assert.equal(normalizeConvertedLines(groups,strokes),groups);
  for(const value of [null,undefined,{},[]])assert.equal(normalizeConvertedLines(value,strokes),value);
  const groups=[group];assert.equal(normalizeConvertedLines(groups,null),groups);
});

test('retains unsupported and unrelated groups by reference in their original order',()=>{
  const {strokes,group}=fixture(),extra=stroke('extra',100,300),other=makeConvertedGroup([extra],'별도',{id:'other'});
  const groups=[other,group],result=normalizeConvertedLines(groups,[...strokes,extra]);
  assert.equal(result[0],other);assert.equal(result.length,3);
  assert.equal(result.map(g=>g.text).join(''),groups.map(g=>g.text).join(''));
});

test('IDs are deterministic, safe, <=100 characters and collision-free with existing and new groups',()=>{
  const parent='p'.repeat(100),{strokes,group}=fixture('one\ntwo',{id:parent});
  const extra=stroke('extra',100,300),collision=makeConvertedGroup([extra],'other',{id:parent.slice(0,94)+'_row_1'});
  const groups=[group,collision],source=[...strokes,extra],result=normalizeConvertedLines(groups,source);
  assert.equal(result.length,3);assert.deepEqual(result,normalizeConvertedLines(groups,source));
  assert.equal(new Set(result.map(g=>g.id)).size,3);
  assert.ok(result.every(g=>/^[A-Za-z0-9_-]{1,100}$/.test(g.id)));
  assert.equal(result[2],collision);
});

test('never exceeds 200 total groups and does not partially split a parent to fit',()=>{
  const {strokes,group}=fixture();
  const extras=Array.from({length:199},(_,i)=>stroke(`extra-${i}`,500,500));
  const fillers=extras.map((s,i)=>makeConvertedGroup([s],'x',{id:`filler-${i}`}));
  const full=[group,...fillers];assert.equal(normalizeConvertedLines(full,[...strokes,...extras]),full);
  const room=[group,...fillers.slice(1)],result=normalizeConvertedLines(room,[...strokes,...extras]);
  assert.equal(result.length,200);assert.equal(result[2],fillers[1]);
  const three=[...strokes,stroke('third',100,260)],larger=makeConvertedGroup(three,'one\ntwo\nthree',{id:'larger'}),notEnough=[larger,...fillers.slice(1)];
  assert.equal(normalizeConvertedLines(notEnough,[...three,...extras]),notEnough);
  const over=[...full,makeConvertedGroup([stroke('last')],'last',{id:'last'})];
  assert.equal(normalizeConvertedLines(over,[...strokes,...extras,stroke('last')]),over);
});

test('all child sources form a unique exact partition even when input strokes are out of row order',()=>{
  const source=[stroke('lower-right',210,180,20),stroke('upper-right',210,100,20),stroke('lower-left',100,180,20),stroke('upper-left',100,100,20)];
  const parent=makeConvertedGroup(source,'upper\nlower',{id:'parent'}),result=normalizeConvertedLines([parent],source);
  assert.equal(result.length,2);
  assert.deepEqual(result[0].strokeIds,['upper-left','upper-right']);
  assert.deepEqual(result[1].strokeIds,['lower-left','lower-right']);
  assert.deepEqual(result.flatMap(g=>g.strokeIds).sort(),parent.strokeIds.slice().sort());
  assert.equal(new Set(result.flatMap(g=>g.strokeIds)).size,source.length);
});
