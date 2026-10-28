import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLibrary} from '../src/library-view.js';
import {setNotebookFavorite} from '../src/library-model.js';
import {makeNote} from '../src/core.js';
import {notebookId} from '../src/notebooks.js';

const page=(id,title,updatedAt=1,extra={})=>({...makeNote(),id,notebookId:id,title,createdAt:0,updatedAt,...extra});
const defer=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject};};
function harness(t,options={}){
 let notes=options.notes||[page('alpha','알파',10),page('beta','베타',20)],current=options.current||notebookId(notes[0]);
 const elements=new Map(),htmlWrites=[],calls={before:0,open:[],favorite:[],create:0};
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.hidden=false;this.disabled=false;this.open=false;this.value='';this.textContent='';this.className='';this.modalCalls=0;this.closeCalls=0;}
  set innerHTML(value){this.html=value;htmlWrites.push({element:this,value});}get innerHTML(){return this.html;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
  showModal(){assert.equal(this.open,false,'duplicate showModal');this.open=true;this.modalCalls++;}
  close(){this.open=false;this.closeCalls++;}
  click(){if(!this.disabled)return this.onclick?.();}
 }
 const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 $('library-sort').value='recent';
 const previous=globalThis.document;globalThis.document={getElementById:$,createElement:tag=>new Element(tag)};
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const api=mountLibrary({getNotes:()=>notes,getCurrent:()=>current,beforeOpen:async()=>{calls.before++;await options.beforeOpen?.();},openNotebook:async id=>{calls.open.push(id);await options.openNotebook?.(id);current=id;},createNotebook:async()=>{calls.create++;await options.createNotebook?.();const p=page(`new-${calls.create}`,'새 노트',100);notes=[...notes,p];current=p.id;},toggleFavorite:async(id,value)=>{calls.favorite.push({id,value});await options.toggleFavorite?.(id,value);notes=setNotebookFavorite(notes,id,value);}});
 return {$,api,calls,htmlWrites,get notes(){return notes;},set notes(value){notes=value;},get current(){return current;},cards:()=>$('library-items').children,title:card=>card.children[0].children[1].textContent};
}

test('actual mount renders notebook count, current state and safe DOM title text with escaped thumbnail SVG',async t=>{
 const title='<img src=x onerror=alert(1)> & 제목',first=page('unsafe',title,30,{text:'<X> & 안전'}),second={...page('second','다른 노트',10),notebookId:'other'},sibling={...page('sibling',title,20),notebookId:'unsafe',pageOrder:1};
 const h=harness(t,{notes:[first,sibling,second],current:'unsafe'});await h.api.show();
 assert.equal(h.$('library-count').textContent,'2개 노트');assert.equal(h.cards().length,2);
 const open=h.cards()[0].children[0],strong=open.children[1],cover=open.children[0];
 assert.equal(strong.textContent,title);assert.equal(strong.innerHTML,undefined);assert.equal(open.getAttribute('aria-current'),'true');assert.equal(open.getAttribute('aria-label'),title+' · 2페이지 열기');
 assert.match(cover.innerHTML,/^<svg\b/);assert.match(cover.innerHTML,/&lt;X&gt;/);assert.ok(!cover.innerHTML.includes('<X>'));assert.ok(!cover.innerHTML.includes('<img'));
 assert.ok(h.htmlWrites.every(write=>write.element.className==='notebook-cover'));assert.equal(cover.getAttribute('aria-hidden'),'true');
});

test('grid/list, title query, sort and empty state change presentation without mutating note data',async t=>{
 const h=harness(t,{notes:[page('a','Alpha 회의',10),page('b','Beta 업무',30),page('c','Alpha 기록',20)]}),before=structuredClone(h.notes);await h.api.show();
 assert.deepEqual(h.cards().map(h.title),['Beta 업무','Alpha 기록','Alpha 회의']);
 h.$('library-list').click();assert.equal(h.$('library-items').className,'library-items list');assert.equal(h.$('library-list').getAttribute('aria-pressed'),'true');
 h.$('library-grid').click();h.$('library-grid').click();assert.equal(h.$('library-items').className,'library-items grid');assert.equal(h.$('library-list').getAttribute('aria-pressed'),'false');
 h.$('library-search').value='  ALPHA  ';h.$('library-search').oninput();assert.equal(h.cards().length,2);assert.equal(h.$('library-count').textContent,'2개 노트');
 h.$('library-sort').value='name';h.$('library-sort').onchange();assert.deepEqual(h.cards().map(h.title),['Alpha 기록','Alpha 회의']);
 h.$('library-search').value='없는 제목';h.$('library-search').oninput();assert.equal(h.cards().length,0);assert.equal(h.$('library-empty').hidden,false);assert.equal(h.$('library-more').hidden,true);
 assert.deepEqual(h.notes,before);
});

test('favorite click is disabled while pending, updates all notebook pages and drives favorite filter',async t=>{
 const gate=defer(),a=page('a','즐겨찾기',10),sibling={...page('a2','즐겨찾기',10),notebookId:'a',pageOrder:1},h=harness(t,{notes:[a,sibling,page('b','다른 노트',5)],toggleFavorite:()=>gate.promise});
 await h.api.show();const star=h.cards()[0].children[1],pending=star.click();assert.equal(star.disabled,true);star.click();assert.equal(h.calls.favorite.length,1);
 gate.resolve();await pending;assert.equal(h.cards()[0].children[1].getAttribute('aria-pressed'),'true');assert.ok(h.notes.filter(p=>p.notebookId==='a').every(p=>p.favorite));
 h.$('library-favorites').click();assert.equal(h.cards().length,1);assert.equal(h.$('library-favorites').getAttribute('aria-pressed'),'true');
 await h.cards()[0].children[1].click();assert.equal(h.cards().length,0);assert.equal(h.$('library-empty').hidden,false);
 h.$('library-all').click();assert.equal(h.cards().length,2);assert.equal(h.$('library-all').getAttribute('aria-pressed'),'true');assert.equal(h.notes[0].updatedAt,10);
});

test('failed favorite callback restores button usability without changing metadata or closing library',async t=>{
 const h=harness(t,{toggleFavorite:async()=>{throw Error('save failed');}});await h.api.show();const star=h.cards()[0].children[1],before=structuredClone(h.notes);
 await assert.rejects(star.click(),/save failed/);assert.equal(star.disabled,false);assert.equal(h.$('library-dialog').open,true);assert.deepEqual(h.notes,before);
});

test('open action waits for notebook activation, closes once resolved and highlights it on next opening',async t=>{
 const gate=defer(),h=harness(t,{openNotebook:()=>gate.promise});await h.api.show();const pending=h.cards()[0].children[0].click();
 assert.deepEqual(h.calls.open,['beta']);assert.equal(h.$('library-dialog').open,true);gate.resolve();await pending;assert.equal(h.current,'beta');assert.equal(h.$('library-dialog').open,false);
 await h.$('sidebar-library').click();assert.equal(h.cards()[0].children[0].getAttribute('aria-current'),'true');h.$('close-library').click();assert.equal(h.current,'beta');
});

test('repeated opening awaits beforeOpen, never double-opens a modal and close does not create or activate notes',async t=>{
 const gate=defer(),h=harness(t,{beforeOpen:()=>gate.promise}),first=h.$('open-library').click(),second=h.$('sidebar-library').click();
 assert.equal(h.$('library-dialog').open,false);assert.equal(h.cards().length,0);gate.resolve();await Promise.all([first,second]);
 assert.equal(h.$('library-dialog').modalCalls,1);assert.equal(h.calls.before,2);h.$('close-library').click();h.$('close-library').click();
 assert.equal(h.calls.create,0);assert.deepEqual(h.calls.open,[]);assert.equal(h.current,'alpha');
 await h.api.show();assert.equal(h.$('library-dialog').modalCalls,2);
});

test('new notebook action waits for callback, closes and includes the created book after reopening',async t=>{
 const gate=defer(),h=harness(t,{createNotebook:()=>gate.promise});await h.api.show();const pending=h.$('library-new').click();
 assert.equal(h.calls.create,1);assert.equal(h.notes.length,2);assert.equal(h.$('library-dialog').open,true);
 gate.resolve();await pending;assert.equal(h.notes.length,3);assert.equal(h.$('library-dialog').open,false);await h.api.show();assert.equal(h.$('library-count').textContent,'3개 노트');assert.equal(h.cards()[0].children[0].getAttribute('aria-current'),'true');
});

test('library loads covers in 24-book increments, search and reopen reset the display budget',async t=>{
 const h=harness(t,{notes:Array.from({length:55},(_,i)=>page(`b-${i}`,`노트 ${String(i).padStart(2,'0')}`,i))});await h.api.show();assert.equal(h.cards().length,24);assert.equal(h.$('library-more').hidden,false);
 h.$('library-more').click();assert.equal(h.cards().length,48);h.$('library-more').click();assert.equal(h.cards().length,55);assert.equal(h.$('library-more').hidden,true);
 h.$('library-search').value='노트';h.$('library-search').oninput();assert.equal(h.cards().length,24);h.$('library-more').click();assert.equal(h.cards().length,48);
 h.$('close-library').click();await h.api.show();assert.equal(h.cards().length,24);assert.equal(h.notes.length,55);
});

test('refresh only updates an open shelf and does not change active notebook or reopen a closed modal',async t=>{
 const h=harness(t);h.api.refresh();assert.equal(h.cards().length,0);await h.api.show();h.notes=[...h.notes,page('c','새 항목',50)];h.api.refresh();assert.equal(h.cards().length,3);assert.equal(h.current,'alpha');
 h.$('close-library').click();h.notes=[...h.notes,page('d','추가 항목',60)];h.api.refresh();assert.equal(h.cards().length,3);assert.equal(h.$('library-dialog').open,false);await h.api.show();assert.equal(h.cards().length,4);
});
