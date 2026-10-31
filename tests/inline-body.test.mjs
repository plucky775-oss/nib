import test from 'node:test';
import assert from 'node:assert/strict';
import {mountInlineBody} from '../src/inline-body.js';
import {getBodyObject,updateBodyText} from '../src/body-text.js';
import {makeNote} from '../src/core.js';

function harness(initial=makeNote()){
 const elements=new Map();
 const element=(id='')=>{
  const classes=new Set();
  return {id,value:'',style:{},hidden:true,clientWidth:450,clientHeight:500,scrollHeight:500,attrs:{},events:{},children:[],parent:null,
   classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
   addEventListener(type,fn){(this.events[type]??=[]).push(fn)},
   dispatch(type,event={}){for(const fn of this.events[type]||[])fn(event)},
   replaceChildren(...children){this.children=children;for(const child of children)child.parent=this},
   append(child){this.children.push(child);child.parent=this},
   contains(target){return target===this||this.children.some(child=>child.contains(target))},
   closest(selector){return selector.split(',').some(part=>part.trim()==='#'+this.id)?this:null},
   setAttribute(k,v){this.attrs[k]=v},focus(){this.focused=(this.focused||0)+1},
   setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end},
   click(){this.clicked=(this.clicked||0)+1;this.dispatch('click')}
  };
 };
 const root=element('root');root.body=element('document-body');root.defaultView=element('window');
 root.getElementById=id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id)};
 root.createElement=()=>element();const $=root.getElementById;
 $('body-controls').append($('body-font'));$('body-controls').append($('body-size'));$('body-controls').append($('body-done'));
 const state={note:initial,applies:[],before:0,closed:0,notifications:[]};
 const ui=mountInlineBody({root,getNote:()=>state.note,getFonts:()=>[{id:'NanumPenScript',name:'나눔펜',family:'NanumPenScript, sans-serif'},{id:'Gaegu',name:'개구',family:'Gaegu, sans-serif'}],beforeOpen(){state.before++},onClose(){state.closed++},notify:m=>state.notifications.push(m),apply(next,options){state.applies.push({next,options});if(state.reject)return false;state.note=next;return true}});
 const input=value=>{$('body-editor').value=value;$('body-editor').dispatch('input')};
 return {root,$,state,ui,input};
}
test('opening inline body shows a native editor at page-top in selected font without creating an object',()=>{
 const h=harness({...makeNote(),font:'Gaegu',fontSize:40});h.ui.open();
 assert.equal(h.ui.isActive(),true);assert.equal(h.state.before,1);assert.equal(h.state.applies.length,0);
 assert.equal(h.$('body-editor').hidden,false);assert.equal(h.$('body-controls').hidden,false);
 assert.equal(h.$('body-editor').style.left,'8%');assert.equal(h.$('body-editor').style.top,'13%');assert.equal(h.$('body-editor').style.fontSize,'20px');
 assert.equal(h.$('body-font').value,'Gaegu');assert.equal(h.$('body-size').value,'40');assert.equal(h.$('keyboard-text').attrs['aria-pressed'],'true');
 assert.equal(h.$('page').classList.contains('body-editing'),true);assert.equal(h.root.body.classList.contains('typing-body'),true);
});
test('repeat open keeps the live draft and repeated typing updates one object with one undo checkpoint',()=>{
 const h=harness();h.ui.open();h.input('첫째');const id=getBodyObject(h.state.note).id;
 h.ui.open();assert.equal(h.state.before,1);assert.equal(h.$('body-editor').value,'첫째');
 h.input('첫째\n둘째');h.input('첫째\n둘째 셋째');assert.equal(h.state.note.convertedGroups.length,1);assert.equal(getBodyObject(h.state.note).id,id);
 assert.deepEqual(h.state.applies.map(call=>call.options.checkpoint),[true,false,false]);
 assert.equal(h.ui.finish(),true);assert.equal(h.state.applies.length,3);assert.equal(h.ui.isActive(),false);
 assert.equal(h.$('body-editor').hidden,true);assert.equal(h.$('body-controls').hidden,true);assert.equal(h.state.closed,1);
 assert.equal(h.$('page').classList.contains('body-editing'),false);assert.equal(h.root.body.classList.contains('typing-body'),false);
});
test('composition input is saved without recreating textarea while navigation waits for compositionend',()=>{
 const h=harness();h.ui.open();const editor=h.$('body-editor');editor.dispatch('compositionstart');h.input('하');
 assert.equal(getBodyObject(h.state.note).text,'하');assert.equal(h.ui.isComposing(),true);assert.equal(h.ui.finish(),false);
 assert.equal(h.ui.isActive(),true);assert.equal(h.$('body-editor'),editor);assert.match(h.$('body-error').textContent,/조합/);
 editor.value='한글';editor.dispatch('compositionend');assert.equal(h.ui.isComposing(),false);assert.equal(getBodyObject(h.state.note).text,'한글');
 assert.equal(h.ui.finish(),true);assert.equal(h.state.closed,1);
});
test('no-op input does not add undo checkpoints and each reopened editing session gets one checkpoint',()=>{
 const h=harness(updateBodyText(makeNote(),'기존',{id:'body'}));h.ui.open();h.input('기존');assert.equal(h.state.applies.length,0);
 h.input('수정');h.ui.finish();h.ui.open();h.input('다시 수정');assert.deepEqual(h.state.applies.map(call=>call.options.checkpoint),[true,true]);
});
test('refused apply preserves draft, blocks finish and retry keeps first checkpoint',()=>{
 const h=harness();h.state.reject=true;h.ui.open();h.input('보관할 글');
 assert.equal(h.state.note.convertedGroups.length,0);assert.equal(h.ui.finish(),false);assert.equal(h.$('body-editor').value,'보관할 글');assert.equal(h.ui.isActive(),true);
 h.state.reject=false;assert.equal(h.ui.commit(),true);assert.equal(getBodyObject(h.state.note).text,'보관할 글');
 assert.ok(h.state.applies.every(call=>call.options.checkpoint));assert.equal(h.ui.finish(),true);
});
test('invalid oversized draft stays available for correction and never overwrites saved body',()=>{
 const h=harness(updateBodyText(makeNote(),'저장된 글',{id:'body'}));h.ui.open();h.input('가'.repeat(50001));
 assert.equal(h.ui.finish(),false);assert.equal(getBodyObject(h.state.note).text,'저장된 글');assert.equal(h.$('body-editor').value.length,50001);
 h.input('고친 글');assert.equal(getBodyObject(h.state.note).text,'고친 글');assert.equal(h.ui.finish(),true);
});
test('page identity guard blocks applying old draft to a newer page',()=>{
 const h=harness();h.ui.open();h.$('body-editor').value='이전 페이지 초안';const next=makeNote();h.state.note=next;
 assert.equal(h.ui.commit(),false);assert.equal(h.ui.finish(),false);assert.equal(h.state.applies.length,0);assert.equal(h.state.note,next);
 assert.match(h.$('body-error').textContent,/페이지가 바뀌/);
});
test('missing custom font identity is retained rather than silently replacing saved font',()=>{
 const font='custom_'+'a'.repeat(64),h=harness(updateBodyText(makeNote(),'내 글씨체',{id:'body',font}));h.ui.open();
 assert.equal(h.$('body-font').value,font);assert.ok(h.$('body-font').children.some(option=>option.value===font));
 h.input('고친 내 글씨체');assert.equal(getBodyObject(h.state.note).font,font);
});
test('font and size controls autosave settings without creating another object',()=>{
 const h=harness();h.ui.open();h.input('본문');h.$('body-font').value='Gaegu';h.$('body-font').dispatch('change');h.$('body-size').value='24';h.$('body-size').dispatch('change');
 assert.equal(h.state.note.convertedGroups.length,1);assert.equal(getBodyObject(h.state.note).font,'Gaegu');assert.equal(getBodyObject(h.state.note).fontSize,24);assert.equal(h.$('body-editor').style.fontSize,'12px');
});
test('overlap and overflow warnings are non-destructive and body-done returns to pen',()=>{
 const h=harness({...makeNote(),strokes:[{id:'raw',width:3,color:'#223247',points:[{x:50,y:50}]}]});h.ui.open();assert.equal(h.$('body-overlap').hidden,false);
 h.$('body-editor').scrollHeight=700;h.input('긴 글');assert.equal(h.$('body-overflow').hidden,false);
 h.$('body-done').dispatch('click');assert.equal(h.ui.isActive(),false);assert.equal(h.$('pen').clicked,1);assert.equal(h.state.note.strokes.length,1);
});
test('editor viewport scrolling alone is not page overflow; warning uses scaled full body height',()=>{
 const h=harness();h.ui.open();h.$('body-editor').clientHeight=150;h.$('body-editor').scrollHeight=400;h.input('화면보다 길지만 페이지에는 들어감');
 assert.equal(h.$('body-overflow').hidden,true);
 h.$('body-editor').scrollHeight=515;h.ui.commit();assert.equal(h.$('body-overflow').hidden,false);
});
test('capture click guard blocks other controls during composition but leaves editor controls native',()=>{
 const h=harness();h.ui.open();h.$('body-editor').dispatch('compositionstart');let prevented=0,stopped=0;
 const other={closest:selector=>selector==='button,input,select,a'?{}:null};
 h.root.dispatch('click',{target:other,preventDefault(){prevented++},stopImmediatePropagation(){stopped++}});
 assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(h.ui.isActive(),true);assert.equal(h.state.notifications.length,1);
 h.root.dispatch('click',{target:h.$('body-font'),preventDefault(){throw Error('native control blocked')},stopImmediatePropagation(){throw Error('native control blocked')}});
});
test('Escape during composition is native; normal Escape finishes and retains text',()=>{
 const h=harness();h.ui.open();h.input('본문');let prevented=0;h.$('body-editor').dispatch('compositionstart');
 h.$('body-editor').dispatch('keydown',{key:'Escape',isComposing:true,preventDefault(){prevented++}});assert.equal(prevented,0);assert.equal(h.ui.isActive(),true);
 h.$('body-editor').dispatch('compositionend');h.$('body-editor').dispatch('keydown',{key:'Escape',preventDefault(){prevented++}});
 assert.equal(prevented,1);assert.equal(h.ui.isActive(),false);assert.equal(getBodyObject(h.state.note).text,'본문');
});
test('rejected draft warns before browser unload; successful input and closed editor do not',()=>{
 const h=harness();h.ui.open();h.state.reject=true;h.input('저장되지 않은 초안');
 assert.equal(h.ui.hasPendingDraft(),true);let prevented=0;
 const event={preventDefault(){prevented++}};h.root.defaultView.dispatch('beforeunload',event);
 assert.equal(prevented,1);assert.equal(event.returnValue,'');
 h.state.reject=false;h.ui.commit();assert.equal(h.ui.hasPendingDraft(),false);
 h.root.defaultView.dispatch('beforeunload',{preventDefault(){prevented++}});assert.equal(prevented,1);
 h.ui.finish();assert.equal(h.ui.hasPendingDraft(),false);
});
test('Escape with invalid draft does not move focus away or close the editor',()=>{
 const h=harness();h.ui.open();h.input('가'.repeat(50001));h.$('body-editor').dispatch('keydown',{key:'Escape',preventDefault(){}});
 assert.equal(h.ui.isActive(),true);assert.equal(h.$('keyboard-text').focused,undefined);assert.equal(h.$('body-editor').value.length,50001);
});
