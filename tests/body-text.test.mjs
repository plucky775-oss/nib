import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BODY_BOUNDS,getBodyObject,updateBodyText,layoutBodyText} from '../src/body-text.js';
import {makeNote,validateNote,parseBackup,History} from '../src/core.js';
import {validateGroups} from '../src/converted-groups.js';
import {addKeyboardText} from '../src/keyboard-text.js';

const initial=()=>({...makeNote(),font:'Gaegu',fontSize:40,strokes:[{id:'ink',width:3,color:'#223247',points:[{x:150,y:200}]}]});
test('new body starts on first body line without replacing ink or existing objects',()=>{
 const note=addKeyboardText(initial(),'기존 객체',{id:'old'}),before=structuredClone(note);
 const next=updateBodyText(note,'새 본문\n두 번째 줄',{id:'body'}),body=getBodyObject(next);
 assert.equal(body.id,'body');assert.deepEqual(body.bounds,BODY_BOUNDS);assert.deepEqual(body.strokeIds,[]);
 assert.equal(body.font,'Gaegu');assert.equal(body.fontSize,40);assert.equal(body.body,true);
 assert.equal(next.convertedGroups[0],note.convertedGroups[0]);assert.equal(next.strokes,note.strokes);
 assert.equal(next.mode,'text');assert.equal(next.showOriginal,false);assert.deepEqual(note,before);
});
test('repeated Korean composition values update one stable body ID',()=>{
 let note=initial();for(const text of ['ㅎ','하','한','한ㄱ','한그','한글','한글\n입력'])note=updateBodyText(note,text,{id:'body'});
 assert.equal(note.convertedGroups.length,1);assert.equal(getBodyObject(note).id,'body');assert.equal(note.text,'한글\n입력');
 note=updateBodyText(note,'완성',{id:'different'});assert.equal(getBodyObject(note).id,'body');
});
test('body font updates retain prior choices and custom fonts survive validation',()=>{
 const custom='custom_'+'a'.repeat(64);
 const one=updateBodyText(initial(),'한글',{id:'body',font:custom,fontSize:24});
 const two=updateBodyText(one,'한글 둘째');assert.equal(getBodyObject(two).font,custom);assert.equal(getBodyObject(two).fontSize,24);
 const three=updateBodyText(two,'한글 셋째',{font:'bad',fontSize:17});assert.equal(getBodyObject(three).font,custom);assert.equal(getBodyObject(three).fontSize,24);
 assert.equal(getBodyObject(validateNote(three)).font,custom);
});
test('editing retains a moved/resized body position and never changes other objects',()=>{
 const one=updateBodyText(addKeyboardText(initial(),'원래 글',{id:'old'}),'본문',{id:'body'});
 getBodyObject(one).bounds={x:80,y:170,width:700,height:900};const before=structuredClone(one);
 const two=updateBodyText(one,'수정');assert.deepEqual(getBodyObject(two).bounds,getBodyObject(one).bounds);
 assert.equal(two.convertedGroups[0],one.convertedGroups[0]);assert.deepEqual(one,before);
});
test('empty whitespace deletes only body and does not remove unrelated ink or objects',()=>{
 const one=addKeyboardText(initial(),'원래 글',{id:'old'}),two=updateBodyText(one,'본문',{id:'body'});
 const three=updateBodyText(two,' \n\t');assert.equal(getBodyObject(three),null);assert.deepEqual(three.convertedGroups,one.convertedGroups);
 assert.equal(three.convertedGroups[0],one.convertedGroups[0]);assert.equal(three.strokes,one.strokes);assert.equal(three.text,'원래 글');
 assert.equal(getBodyObject(updateBodyText(initial(),'')),null);
});
test('legacy unplaced text survives adding and clearing a body',()=>{
 const old={...initial(),text:'옛날 원문'};const next=updateBodyText(old,'새 본문',{id:'body'});
 assert.equal(next.convertedGroups.length,2);assert.equal(next.convertedGroups[0].text,'옛날 원문');assert.equal(next.convertedGroups[0].recovery,'legacy-text');
 assert.equal(updateBodyText(next,'').text,'옛날 원문');
});
test('marker survives reload, JSON backup, undo and redo',()=>{
 const note=initial(),next=updateBodyText(note,'저장할 본문',{id:'body'}),history=new History();history.push(note);
 const restored=parseBackup(JSON.stringify({version:1,notes:[next]}))[0];assert.deepEqual(restored.convertedGroups,next.convertedGroups);
 assert.equal(getBodyObject(validateNote(next)).body,true);assert.deepEqual(history.undo(next),note);assert.deepEqual(history.redo(note),next);
});
test('only explicit true is a body marker and duplicate bodies are rejected',()=>{
 const body=getBodyObject(updateBodyText(initial(),'본문',{id:'body'}));
 assert.equal(validateGroups([{...body,body:'true'}],[])[0].body,undefined);
 assert.equal(validateGroups([{...body,body:1}],[])[0].body,undefined);
 assert.throws(()=>validateGroups([body,{...body,id:'second'}],[]),/본문이 하나/);
 assert.throws(()=>updateBodyText({...initial(),convertedGroups:[body,{...body,id:'second'}]},'입력'),/본문이 하나/);
});
test('invalid IDs, excess body/aggregate text and excess object count reject without mutation',()=>{
 const note=initial(),before=structuredClone(note);
 assert.throws(()=>updateBodyText(note,42));assert.throws(()=>updateBodyText(note,'본문',{id:'bad id'}));
 assert.throws(()=>updateBodyText(note,'가'.repeat(50001)));assert.deepEqual(note,before);
 const full=addKeyboardText(note,'가'.repeat(49999),{id:'old'});assert.throws(()=>updateBodyText(full,'나',{id:'body'}));
 const body=getBodyObject(updateBodyText(note,'가',{id:'body'}));
 const crowded={...note,convertedGroups:Array.from({length:200},(_,i)=>({...body,id:'g'+i,body:false}))};
 assert.throws(()=>updateBodyText(crowded,'본문',{id:'new'}));
 assert.equal(getBodyObject(updateBodyText(note,'가'.repeat(50000),{id:'body'})).text.length,50000);
});
test('body layout wraps and preserves blank/newlines without shrinking',()=>{
 const layout=layoutBodyText('가나다라\n\n마바사',{width:30,height:20},32,{measure:text=>Array.from(text).length*10});
 assert.deepEqual(layout.lines,['가나다','라','','마바사']);assert.equal(layout.fontSize,32);assert.equal(layout.lineHeight,38.4);assert.equal(layout.overflow,true);
 assert.deepEqual(layoutBodyText('a\r\nb\rc',{width:100,height:200},24).lines,['a','b','c']);
});
test('long body has no 3000-character preview cap, size fitting or hidden ellipsis',()=>{
 const text='한'.repeat(4001),layout=layoutBodyText(text,BODY_BOUNDS,40);
 assert.equal(layout.lines.join(''),text);assert.equal(layout.fontSize,40);assert.equal(layout.overflow,true);
 assert.ok(!layout.lines.join('').includes('…'));
 const bad=layoutBodyText('본문',{width:0,height:0},40);assert.equal(bad.fontSize,40);assert.equal(bad.overflow,true);
});
test('body implementation has no recognition or network calls',()=>{
 const source=readFileSync(new URL('../src/body-text.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\s*\(|XMLHttpRequest|requestRecognition|recognition-client|\/api\//);
});
