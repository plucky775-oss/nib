import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConvertedLines} from '../src/converted-lines.js';
import {makeConvertedGroup,validateGroups,MAX_GROUPS} from '../src/converted-groups.js';
import {makeNote,parseBackup} from '../src/core.js';
import {moveTextObject} from '../src/text-objects.js';

const stroke=(id,x=100,y=100,width=180)=>({id,width:3,color:'#223247',points:[{x,y},{x:x+width,y:y+25}]});
const fixture=(text='첫째 줄\n둘째 줄',options={})=>{
  const strokes=[stroke('first'),stroke('second',140,180,95)];
  return {strokes,group:makeConvertedGroup(strokes,text,{id:'parent',...options})};
};
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;};

test('one explicit multiline conversion stays one durable object with exact CRLF and Unicode',()=>{
  const {strokes,group}=fixture('한글 😀  첫째  \r\n  둘째 끝',{font:'Gaegu',fontSize:24});
  const groups=freeze([group]),before=structuredClone({strokes,groups});freeze(strokes);
  const result=normalizeConvertedLines(groups,strokes);
  assert.equal(result,groups);assert.equal(result.length,1);assert.equal(result[0],group);
  assert.equal(result[0].kind,'text-object');assert.equal(result[0].text,'한글 😀  첫째  \r\n  둘째 끝');
  assert.deepEqual(result[0].strokeIds,['first','second']);assert.equal(result[0].font,'Gaegu');assert.equal(result[0].fontSize,24);
  assert.deepEqual({strokes,groups},before);assert.deepEqual(validateGroups(result,[]),result);
  assert.equal(normalizeConvertedLines(result,strokes),result);
});

test('normalization never infers a new object count from text lines or source geometry',()=>{
  for(const text of ['no separator','one\ntwo','one\ntwo\nthree','one\n',' \ntwo','one\rsecond','one\n\ntwo']){
    const {strokes,group}=fixture(text),groups=[group];
    for(const source of [strokes,[],[strokes[0]],[...strokes,stroke('third',100,300)]])assert.equal(normalizeConvertedLines(groups,source),groups,text);
  }
  const {group}=fixture(),groups=[group];
  for(const source of [null,undefined,[{id:'first',points:[{x:NaN,y:100}]}]])assert.equal(normalizeConvertedLines(groups,source),groups);
});

test('historical row-shaped IDs remain separate; no automatic sibling merge or source-text reinterpretation',()=>{
  const first={...fixture('윗줄\r\n',{id:'old_row_1',font:'Gaegu'}).group,strokeIds:['first']};
  const second={...fixture('아랫줄',{id:'old_row_2',font:'PoorStory',fontSize:40}).group,strokeIds:['second'],bounds:{x:400,y:400,width:200,height:80}};
  const groups=freeze([first,second]),before=structuredClone(groups);
  assert.equal(normalizeConvertedLines(groups,[]),groups);assert.equal(groups.length,2);
  assert.deepEqual(groups,before);assert.equal(groups.map(g=>g.text).join(''),'윗줄\r\n아랫줄');
  const restored=parseBackup(JSON.stringify({version:1,notes:[{...makeNote(),strokes:[],convertedGroups:groups}]}))[0];
  assert.deepEqual(restored.convertedGroups,groups);
});

test('moving one conversion moves its full multiline object and leaves other conversion events unchanged',()=>{
  const {strokes,group}=fixture('윗줄\n아랫줄',{font:'Gaegu',fontSize:32});
  const other=makeConvertedGroup([stroke('other',500,500)],'별개 객체',{id:'other',font:'PoorStory',fontSize:24});
  const note={...makeNote(),strokes:[],convertedGroups:[group,other],text:group.text+'\n'+other.text},before=structuredClone(note);
  const moved=moveTextObject(note,group.id,30,12);
  assert.equal(moved.moved,true);assert.equal(moved.note.convertedGroups.length,2);
  assert.equal(moved.note.convertedGroups[0].text,'윗줄\n아랫줄');
  assert.deepEqual(moved.note.convertedGroups[0].strokeIds,strokes.map(s=>s.id));
  assert.deepEqual(moved.note.convertedGroups[0].bounds,{...group.bounds,x:group.bounds.x+30,y:group.bounds.y+12});
  assert.equal(moved.note.convertedGroups[1],other);assert.equal(moved.note.text,note.text);assert.deepEqual(note,before);
});

test('JSON backup preserves full multiline text, own bounds and font when all original ink is absent',()=>{
  const {group}=fixture('첫째\n둘째\n셋째',{font:'custom_'+'b'.repeat(64),fontSize:40});
  const groups=normalizeConvertedLines([group],[]),note={...makeNote(),strokes:[],convertedGroups:groups,text:group.text};
  const restored=parseBackup(JSON.stringify({version:1,notes:[note]}))[0];
  assert.deepEqual(restored.convertedGroups,[group]);assert.deepEqual(restored.strokes,[]);
  assert.equal(restored.convertedGroups[0].text,group.text);assert.equal(restored.convertedGroups.length,1);
});

test('normalizer is not a destructive sanitizer for missing, malformed or shared provenance',()=>{
  const {strokes,group}=fixture();
  const cases=[null,undefined,{},[],[{...group,id:'<unsafe>'}],[{...group,strokeIds:[]}],[{...group,strokeIds:['first','first']}],[{...group,strokeIds:['missing']}],[group,{...group,id:'other'}]];
  for(const groups of cases)assert.equal(normalizeConvertedLines(groups,strokes),groups);
});

test('unrelated objects retain identity, full content, IDs and insertion order',()=>{
  const {group}=fixture(),other=fixture('별도\n여러 줄',{id:'other'}).group,groups=freeze([other,group]);
  const result=normalizeConvertedLines(groups,[]);
  assert.equal(result,groups);assert.equal(result[0],other);assert.equal(result[1],group);
  assert.deepEqual(result.map(g=>g.id),['other','parent']);assert.equal(result.map(g=>g.text).join(''),other.text+group.text);
});

test('normalization never invents child IDs even when a historical-looking ID already exists',()=>{
  const parent='p'.repeat(100),{group}=fixture('one\ntwo',{id:parent});
  const collision=fixture('other',{id:parent.slice(0,94)+'_row_1'}).group,groups=[group,collision];
  assert.equal(normalizeConvertedLines(groups,[]),groups);assert.deepEqual(groups.map(g=>g.id),[parent,collision.id]);
  assert.equal(new Set(groups.map(g=>g.id)).size,2);
});

test('capacity handling is not an excuse to split, merge or discard existing durable objects',()=>{
  for(const count of [1,MAX_GROUPS-1,MAX_GROUPS,MAX_GROUPS+1]){
    const groups=Array.from({length:count},(_,i)=>fixture('one\ntwo',{id:`g-${i}`}).group);
    assert.equal(normalizeConvertedLines(groups,[]),groups);assert.equal(groups.length,count);
    if(count>MAX_GROUPS)assert.throws(()=>validateGroups(groups,[]));else assert.equal(validateGroups(groups,[]).length,count);
  }
});

test('out-of-row-order source IDs remain provenance, not instructions to repartition text',()=>{
  const source=[stroke('lower-right',210,180,20),stroke('upper-right',210,100,20),stroke('lower-left',100,180,20),stroke('upper-left',100,100,20)];
  const group=makeConvertedGroup(source,'upper\nlower',{id:'parent'}),groups=[group];
  assert.equal(normalizeConvertedLines(groups,source),groups);assert.equal(groups[0].text,'upper\nlower');
  assert.deepEqual(groups[0].strokeIds,source.map(s=>s.id));assert.equal(groups.length,1);
});
