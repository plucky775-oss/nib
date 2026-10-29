import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {editTextObject,restoreTextObjects,mountTextObjectEditor} from '../src/text-object-editor.js';
import {makeNote,validateNote,History} from '../src/core.js';
import {makeConvertedGroup} from '../src/converted-groups.js';

function fixture(){
 const strokes=['a','b','new'].map((id,i)=>({id,width:3,color:'#223247',points:[{x:100,y:100+i*180,pressure:.3},{x:300,y:160+i*180,pressure:.8}]}));
 const groups=strokes.slice(0,2).map((s,i)=>makeConvertedGroup([s],i?'다른 글':'수정할 글',{id:'g'+i,font:i?'PoorStory':'Gaegu',fontSize:32}));
 return {...makeNote(),strokes,convertedGroups:groups,text:groups.map(g=>g.text).join('\n')};
}
test('scoped correction and resize preserve original ink, other objects and page identity through backup',()=>{
 const note=fixture(),before=structuredClone(note);
 const next=editTextObject(note,'g0',{text:'고친 글\n둘째 줄',width:350,height:180});
 assert.deepEqual(note,before);assert.strictEqual(next.strokes,note.strokes);
 assert.strictEqual(next.convertedGroups[1],note.convertedGroups[1]);
 assert.deepEqual(next.convertedGroups[0].bounds,{...note.convertedGroups[0].bounds,width:350,height:180});
 const reopened=validateNote(JSON.parse(JSON.stringify(next)));
 assert.equal(reopened.id,note.id);assert.equal(reopened.convertedGroups[0].text,'고친 글\n둘째 줄');
 assert.deepEqual(reopened.strokes,note.strokes);assert.equal(reopened.convertedGroups[0].font,'Gaegu');
});
test('invalid, blank, oversized and off-paper edits leave the page untouched',()=>{
 const note=fixture(),before=structuredClone(note);
 for(const edit of [{text:'',width:100,height:100},{text:'가'.repeat(50001),width:100,height:100},{text:'글',width:Infinity,height:100},{text:'글',width:900,height:100},{text:'글',width:100,height:1200}])assert.throws(()=>editTextObject(note,'g0',edit));
 assert.deepEqual(note,before);
});
test('restore affects selected conversion only and undo restores exact text and size',()=>{
 const note=editTextObject(fixture(),'g0',{text:'고친 글',width:300,height:200}),history=new History();history.push(note);
 const restored=restoreTextObjects(note,['g0']);
 assert.strictEqual(restored.strokes,note.strokes);assert.equal(restored.convertedGroups.length,1);
 assert.strictEqual(restored.convertedGroups[0],note.convertedGroups[1]);
 assert.equal(restored.text,'다른 글');assert.deepEqual(history.undo(restored),note);
});
test('last-object restore remains raw ink after validation and does not revive legacy text',()=>{
 const note=fixture(),restored=restoreTextObjects(note,['g0','g1']);
 const reopened=validateNote(JSON.parse(JSON.stringify(restored)));
 assert.equal(reopened.text,'');assert.deepEqual(reopened.convertedGroups,[]);assert.deepEqual(reopened.strokes,note.strokes);
});
test('missing or shared source ink refuses restore without deleting durable text',()=>{
 for(const kind of ['missing','typed','shared']){
  const note=fixture();if(kind==='missing')note.strokes=note.strokes.filter(s=>s.id!=='a');
  if(kind==='typed')note.convertedGroups[0].strokeIds=[];
  if(kind==='shared')note.convertedGroups[1].strokeIds.push('a');
  const before=structuredClone(note);assert.throws(()=>restoreTextObjects(note,['g0']));assert.deepEqual(note,before);
 }
 const shared=fixture();shared.convertedGroups[1].strokeIds.push('a');assert.equal(restoreTextObjects(shared,['g0','g1']).convertedGroups.length,0);
});
function ui(){
 let note=fixture(),selection=['g0'],applies=0;const els={},history=new History();
 const root={getElementById:id=>els[id]??={hidden:true,value:'',textContent:'',focus(){this.focused=true}}};
 mountTextObjectEditor({root,getNote:()=>note,getSelection:()=>selection,beforeOpen(){},notify:m=>els.message=m,apply:next=>{history.push(note);note=next;applies++;}});
 return {els,$:root.getElementById,get note(){return note},set note(n){note=n},get applies(){return applies},history,setSelection:ids=>selection=ids,submit:()=>els['object-edit-form'].onsubmit({preventDefault(){}})};
}
test('same-page editor cancel does not persist draft; submit makes one undoable edit',()=>{
 const h=ui(),original=structuredClone(h.note);h.$('selection-edit').onclick();
 assert.equal(h.$('object-editor').hidden,false);h.$('object-text').value='취소할 내용';h.$('cancel-object-edit').onclick();
 assert.deepEqual(h.note,original);assert.equal(h.applies,0);h.submit();assert.equal(h.applies,0);
 h.$('selection-edit').onclick();h.$('object-text').value='수정한 내용';h.$('object-width').value='300';h.submit();
 assert.equal(h.note.convertedGroups[0].text,'수정한 내용');assert.equal(h.applies,1);assert.equal(h.$('object-editor').hidden,true);
 assert.deepEqual(h.history.undo(h.note),original);
});
test('page switch, selection dismissal or concurrent change cannot apply a stale edit',()=>{
 for(const kind of ['page','dismiss','object']){
  const h=ui();h.$('selection-edit').onclick();h.$('object-text').value='지난 편집';
  if(kind==='page')h.note={...h.note,id:'another-page'};
  if(kind==='dismiss')h.$('object-editor').hidden=true;
  if(kind==='object')h.note=editTextObject(h.note,'g0',{text:'새 내용',width:200,height:120});
  const before=structuredClone(h.note);h.submit();assert.equal(h.applies,0);assert.deepEqual(h.note,before);
 }
});
test('restore button preserves other ink and groups and supports one-step undo',()=>{
 const h=ui(),before=structuredClone(h.note);h.$('selection-restore').onclick();
 assert.equal(h.applies,1);assert.deepEqual(h.note.strokes,before.strokes);assert.equal(h.note.convertedGroups[0].id,'g1');
 assert.deepEqual(h.history.undo(h.note),before);
});
test('unchanged editor submission avoids a redundant undo or write',()=>{
 const h=ui();h.$('selection-edit').onclick();h.submit();assert.equal(h.applies,0);
});
test('all editor controls exist on the same page and module is cached offline',()=>{
 const html=readFileSync('index.html','utf8'),js=readFileSync('src/text-object-editor.js','utf8'),sw=readFileSync('public/sw.js','utf8');
 for(const [,id]of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<section id="object-editor"/);assert.match(sw,/text-object-editor\.js/);
});
