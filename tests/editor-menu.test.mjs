import test from 'node:test';
import assert from 'node:assert/strict';
import {mountEditorMenus} from '../src/editor-menu.js';
import {mountPageSwipe} from '../src/page-swipe.js';
import {readFileSync} from 'node:fs';

function fixture(){
 const elements=new Map(),events=new Map(),windowEvents=new Map(),calls=[];let focus=null;
 class Element{
  constructor(id){this.id=id;this.attrs={};this.listeners=new Map();this.hidden=true;this.style={};this.children=[];this.parent=null;this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return k in this.attrs;}
  contains(target){return target===this||this.children.some(c=>c.contains(target));}
  append(child){child.parent=this;this.children.push(child);return child;}
  addEventListener(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
  emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  click(){this.emit('click',{target:this});calls.push(['click',this.id]);}
  focus(){focus=this;}
  getBoundingClientRect(){return {bottom:100,right:300};}
  querySelector(){return this.children[0];}
  closest(){return this.button?this:this.parent?.closest();}
 }
 const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
 const root={getElementById:$,querySelectorAll:()=>['insert','tool','document'].map(k=>$(k+'-close')),addEventListener:(name,fn,opts)=>{const list=events.get(name)||[];list.push({fn,opts});events.set(name,list);},defaultView:{innerWidth:1024,innerHeight:768,addEventListener:(name,fn)=>windowEvents.set(name,fn)}};
 for(const key of ['insert','tool','document']){const close=$(key+'-close');close.button=true;close.setAttribute('data-close-editor-menu','');$(key+'-menu').append(close);}
 for(const id of ['keyboard-text','insert-freehand','insert-table','open-drawing']){const button=$(id);button.button=true;$('insert-menu').append(button);}
 $('paper-viewport').append($('canvas'));$('pen').setAttribute('aria-pressed','true');
 const drawing={hidePanel:()=>calls.push(['hidePanel']),open:tool=>calls.push(['open',tool]),deactivate:()=>calls.push(['deactivate'])};
 const api=mountEditorMenus({root,beforeOpen:()=>calls.push(['beforeOpen']),getDrawing:()=>drawing});
 const emit=(name,target,extra={})=>{const e={target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.immediate=true;},stopPropagation(){this.stopped=true;},...extra};for(const {fn}of events.get(name)||[]){fn(e);if(e.immediate)break;}return e;};
 return {api,$,root,calls,emit,events,windowEvents,get focus(){return focus;}};
}

test('one popup opens at a time with accessible expanded state and focus',()=>{
 const f=fixture();f.api.open('insert');assert.equal(f.api.getOpen(),'insert');assert.equal(f.$('insert-menu').hidden,false);assert.equal(f.$('insert-menu-toggle').getAttribute('aria-expanded'),'true');assert.equal(f.focus,f.$('insert-close'));
 assert.equal(f.$('insert-menu').style.top,'106px');assert.equal(f.$('insert-menu').style.right,'696px');
 f.api.open('document');assert.equal(f.$('insert-menu').hidden,true);assert.equal(f.$('insert-menu-toggle').getAttribute('aria-expanded'),'false');assert.equal(f.api.getOpen(),'document');
 f.api.open('document');assert.equal(f.api.getOpen(),null);assert.equal(f.focus,f.$('document-menu-toggle'));
 assert.deepEqual(f.calls,[['beforeOpen'],['hidePanel'],['beforeOpen'],['hidePanel']]);
});
test('Escape restores trigger focus, but outside action retains destination focus',()=>{
 const f=fixture();f.api.open('tool');const e=f.emit('keydown',f.$('tool-close'),{key:'Escape'});assert.ok(e.prevented&&e.stopped);assert.equal(f.api.getOpen(),null);assert.equal(f.focus,f.$('tool-menu-toggle'));
 f.api.open('document');f.$('title').focus();f.emit('focusin',f.$('title'));assert.equal(f.api.getOpen(),null);assert.equal(f.focus,f.$('title'));
});
test('paper dismiss pointer is consumed, other UI dismiss is not',()=>{
 const f=fixture();f.api.open('insert');const e=f.emit('pointerdown',f.$('canvas'));assert.equal(f.api.getOpen(),null);assert.ok(e.prevented&&e.immediate);
 f.api.open('insert');const other=f.emit('pointerdown',f.$('undo'));assert.equal(f.api.getOpen(),null);assert.equal(other.prevented,undefined);assert.equal(other.immediate,undefined);
});
test('inside popup and other trigger pointer do not prematurely close',()=>{
 const f=fixture();f.api.open('insert');f.emit('pointerdown',f.$('keyboard-text'));assert.equal(f.api.getOpen(),'insert');f.emit('pointerdown',f.$('document-menu-toggle'));assert.equal(f.api.getOpen(),'insert');
});
test('legacy action capture closes before modal opens, without stealing focus',()=>{
 const f=fixture();f.api.open('insert');f.emit('click',f.$('keyboard-text'));assert.equal(f.api.getOpen(),null);f.$('text-editor').focus();assert.equal(f.focus,f.$('text-editor'));
 f.api.open('insert');f.emit('click',f.$('insert-close'));assert.equal(f.api.getOpen(),'insert');f.$('insert-close').click();assert.equal(f.api.getOpen(),null);assert.equal(f.focus,f.$('insert-menu-toggle'));
});
test('pen, eraser and lasso show only relevant options',()=>{
 const f=fixture();assert.equal(f.$('pen-tool-options').hidden,false);assert.equal(f.$('eraser-options').hidden,true);assert.equal(f.$('select-tool-options').hidden,true);
 f.$('eraser').setAttribute('aria-pressed','true');f.api.syncTool();assert.equal(f.$('eraser-options').hidden,false);assert.equal(f.$('pen-tool-options').hidden,true);assert.equal(f.$('tool-menu-label').textContent,'지우개 크기');
 f.$('eraser').setAttribute('aria-pressed','false');f.$('select').setAttribute('aria-pressed','true');f.api.syncTool();assert.equal(f.$('select-tool-options').hidden,false);assert.equal(f.$('tool-menu-label').textContent,'선택 안내');
});
test('drawing options route to palette, and table / freehand retain explicit tools',()=>{
 const f=fixture();f.api.syncDrawing({active:true,tool:'table'});assert.equal(f.$('drawing-mode-bar').hidden,false);assert.match(f.$('drawing-mode-label').textContent,/표/);assert.equal(f.$('tool-menu-label').textContent,'도형 옵션');
 f.api.open('tool');assert.equal(f.api.getOpen(),null);assert.deepEqual(f.calls.at(-1),['open',undefined]);
 f.api.open('insert');f.$('insert-table').click();assert.equal(f.api.getOpen(),null);assert.ok(f.calls.some(c=>c[0]==='open'&&c[1]==='table'));
 f.api.open('insert');f.$('insert-freehand').click();assert.equal(f.api.getOpen(),null);assert.deepEqual(f.calls.slice(-3),[['deactivate'],['click','pen'],['click','insert-freehand']]);
 f.api.syncDrawing({active:false});assert.equal(f.$('drawing-mode-bar').hidden,true);
});
test('value changes and backgrounding close menu without restoring trigger focus',()=>{
 const f=fixture();for(const id of ['paper','width','color','eraser-size','pan-page']){f.api.open('document');f.$(id).emit('change');assert.equal(f.api.getOpen(),null);}
 f.api.open('insert');f.root.hidden=true;f.emit('visibilitychange',null);assert.equal(f.api.getOpen(),null);
});
test('popover position clamps to viewport after resize',()=>{
 const f=fixture();f.root.defaultView.innerHeight=180;f.root.defaultView.innerWidth=320;f.api.open('insert');assert.equal(f.$('insert-menu').style.top,'20px');assert.equal(f.$('insert-menu').style.maxHeight,'148px');
 f.root.defaultView.innerHeight=768;f.windowEvents.get('resize')();assert.equal(f.$('insert-menu').style.top,'106px');
});

// Pointer events and native TouchEvents coexist on iPad. Dismissal must not
// leak the same contact into the independently mounted page gesture engine.
test('touch dismissal consumes native gesture lifecycle then releases next touch',()=>{
 const f=fixture();f.api.open('insert');f.emit('pointerdown',f.$('canvas'),{pointerType:'touch',pointerId:1});
 for(const type of ['touchstart','touchmove']){const e=f.emit(type,f.$('canvas'),{touches:[{identifier:1}]});assert.ok(e.prevented&&e.immediate,type);}
 const end=f.emit('touchend',f.$('canvas'),{touches:[]});assert.ok(end.prevented&&end.immediate);
 assert.equal(f.emit('touchstart',f.$('canvas'),{touches:[{identifier:2}]}).prevented,undefined);
});
test('pen dismissal does not block subsequent native touch interactions',()=>{
 const f=fixture();f.api.open('insert');f.emit('pointerdown',f.$('canvas'),{pointerType:'pen'});assert.equal(f.emit('touchstart',f.$('canvas'),{touches:[{}]}).prevented,undefined);
});
test('touch cancellation releases subsequent native gestures',()=>{
 const f=fixture();f.api.open('insert');f.emit('pointerdown',f.$('canvas'),{pointerType:'touch'});const e=f.emit('touchcancel',f.$('canvas'),{touches:[]});assert.ok(e.prevented&&e.immediate);assert.equal(f.emit('touchstart',f.$('canvas'),{touches:[{}]}).prevented,undefined);
});
test('popup left edge remains within viewport even for leftmost trigger',()=>{
 const f=fixture();f.$('insert-menu-toggle').getBoundingClientRect=()=>({bottom:100,right:40});f.api.open('insert');assert.equal(f.$('insert-menu').style.right,'696px');
});

test('menu dismissal does not enter the actual native page-swipe engine',()=>{
 const f=fixture(),navigations=[];f.$('paper-viewport').getBoundingClientRect=()=>({left:0,top:0,width:900,height:1200});
 const swipe=mountPageSwipe({root:f.root,nativeTouch:true,canvas:f.$('canvas'),surface:f.$('paper-viewport'),getPageId:()=> 'page',canStart:()=>true,canSwipe:()=>true,getAction:()=> 'next',navigate:a=>navigations.push(a)});
 f.api.open('document');f.emit('pointerdown',f.$('canvas'),{pointerType:'touch',pointerId:1});
 const touch={target:f.$('canvas'),identifier:1,clientX:100,clientY:100};
 f.emit('touchstart',f.$('canvas'),{touches:[touch],cancelable:true});assert.equal(swipe.hasGesture(),false);
 f.emit('touchmove',f.$('canvas'),{touches:[{...touch,clientX:600}],cancelable:true});
 f.emit('touchend',f.$('canvas'),{touches:[],changedTouches:[{...touch,clientX:600}],cancelable:true});assert.deepEqual(navigations,[]);
 f.emit('touchstart',f.$('canvas'),{touches:[touch],cancelable:true});assert.equal(swipe.hasGesture(),true,'next independent contact returns to normal page handling');
});
test('partial multi-touch release stays blocked until every finger lifts',()=>{
 const f=fixture();f.api.open('insert');f.emit('pointerdown',f.$('canvas'),{pointerType:'touch'});
 f.emit('touchstart',f.$('canvas'),{touches:[{identifier:1},{identifier:2}]});
 assert.ok(f.emit('touchend',f.$('canvas'),{touches:[{identifier:2}]}).prevented);
 assert.ok(f.emit('touchmove',f.$('canvas'),{touches:[{identifier:2}]}).prevented);
 f.emit('touchend',f.$('canvas'),{touches:[]});assert.equal(f.emit('touchstart',f.$('canvas'),{touches:[{}]}).prevented,undefined);
});
test('backgrounding clears an interrupted dismiss contact',()=>{
 const f=fixture();f.api.open('insert');f.emit('pointerdown',f.$('canvas'),{pointerType:'touch'});f.root.hidden=true;f.emit('visibilitychange',null);f.root.hidden=false;
 assert.equal(f.emit('touchstart',f.$('canvas'),{touches:[{}]}).prevented,undefined);
});
test('app registers menu capture before drawing/page gesture engines and cancels old swipe',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),menu=app.indexOf('editorMenus=mountEditorMenus('),drawing=app.indexOf('drawingTools=mountDrawingTools('),swipe=app.indexOf('pageSwipe=mountPageSwipe(');
 assert.ok(menu>0&&menu<drawing&&menu<swipe,'dismissal capture must run before both gesture engines');assert.match(app.slice(menu,drawing),/pageSwipe\?\.cancel\(\)/);
});
