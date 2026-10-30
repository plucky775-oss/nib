import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {History,makeNote,validateNote,FONTS} from '../src/core.js';
import {customFontId} from '../src/custom-fonts.js';
import {fitGroupText,activeConvertedGroups} from '../src/converted-groups.js';
import {moveTextObject} from '../src/text-objects.js';
import {hitTestText,acceptDirectTouch} from '../src/text-hit.js';
import {normalizePenKind} from '../src/pen-renderer.js';
import * as input from '../src/ink-input.js';
import * as selection from '../src/selection.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),plain=v=>JSON.parse(JSON.stringify(v));
function piece(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
const stroke=(id,x,y)=>({id,width:3,color:'#223247',points:[{x,y,pressure:.4},{x:x+30,y:y+20,pressure:.7}]});
function harness(){
 const nodes=new Map(),rootEvents=new Map(),frames=new Map(),callbacks=new Map(),rect={left:0,top:0,width:900,height:1200},counts={svg:0,attrs:0,measure:0,drawingRender:0,moves:0,dirty:0,auto:0},replacements=new Map();let frameId=0;
 function element(tag){return {tag,children:[],attrs:{},events:new Map(),hidden:false,checked:false,value:'',style:{},classList:{toggle(){},remove(){}},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;replacements.set(tag,(replacements.get(tag)||0)+1);},setAttribute(k,v){counts.attrs++;this.attrs[k]=v;},toggleAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){this.events.set(type,fn);},getBoundingClientRect:()=>({...rect}),setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;},focus(){},close(){}};}
 const $=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);},metrics={font:'',measureText(text){counts.measure++;return {width:Array.from(text).length*Number.parseFloat(this.font)*.5};}};
 const original={...makeNote(),id:'frame-page',font:'Gaegu',fontSize:24,mode:'ink',strokes:[stroke('source',110,120),stroke('visible',500,650)],convertedGroups:[{kind:'text-object',id:'object',strokeIds:['source'],text:'첫 줄\n둘째 줄',font:'Gaegu',fontSize:24,bounds:{x:100,y:100,width:260,height:160}},{kind:'text-object',id:'other',strokeIds:[],text:'그대로',font:'PoorStory',fontSize:32,bounds:{x:500,y:400,width:200,height:100}}],drawingObjects:[{id:'shape',type:'rectangle',bounds:{x:50,y:800,width:100,height:100},text:'그림 보존',color:'#223247',width:2,fill:'none',font:'Gaegu',fontSize:24,reverse:false,flipY:false}]};
 const history=new History(),scope={...input,...selection,History,FONTS,customFontId,customFaces:new Map(),fitGroupText,activeConvertedGroups,hitTestText,acceptDirectTouch,normalizePenKind,structuredClone,NS:'svg',$,metrics:undefined,layoutCache:new Map(),note:original,notes:[original],history,tool:'pen',drawing:null,strokeRect:null,selectedIds:[],selectedObjectIds:[],selectionEpoch:0,autoEngine:{setWriting(){}},autoEnabled:false,textBefore:null,
  document:{createElement:tag=>tag==='canvas'?{getContext:()=>metrics}:element(tag),createElementNS:(_ns,tag)=>{counts.svg++;return element(tag);},addEventListener(type,fn){rootEvents.set(type,fn);},fonts:{addEventListener(type,fn){rootEvents.set('font:'+type,fn);}}},
  requestAnimationFrame(fn){const id=++frameId;frames.set(id,fn);callbacks.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},
  moveTextObject(...args){counts.moves++;return moveTextObject(...args);},drawingTools:{render(){counts.drawingRender++;},cancel(){}},pageSwipe:{cancel(){}},
  isWriting:()=>true,stopAuto(){},toast(){},buttons(){},dirty(){counts.dirty++;},autoChanged(){counts.auto++;},commitText(){},render(){scope.renderInk();},path:s=>({tag:'raw',stroke:s}),id:()=> 'new-stroke'};
 vm.createContext(scope);
 vm.runInContext(piece('function clearSelection(','function isWriting(')+piece('function resolvedFont(','function freezeGroupFonts(')+piece('function visibleGroups(','let metrics;')+piece('function groupLayout(','function list(')+piece('function eraserRadius(',"$('new-note').onclick")+piece("$('undo').onclick", "$('shape-correct').onchange"),scope);
 vm.runInContext(source.split('\n').find(line=>line.startsWith("for(const event of ['loadingdone','loadingerror'])")),scope);
 $('width').value='3';$('color').value='#223247';scope.renderInk();
 const send=(type,x=130,y=130,extra={})=>{const e={target:$('canvas'),button:0,pointerId:7,pointerType:'touch',isPrimary:true,width:12,height:12,clientX:x,clientY:y,pressure:.5,preventDefault(){this.defaultPrevented=true;},...extra};$('canvas').events.get(type)?.(e);return e;};
 return {scope,$,counts,replacements,original,rect,frames,callbacks,rootEvents,send,reset(){for(const key of Object.keys(counts))counts[key]=0;replacements.clear();},frame(){const batch=[...frames];frames.clear();for(const [,fn]of batch)fn();},wrapper:id=>$('converted-ink').children.find(n=>n.attrs?.['data-text-object-id']===id),target:id=>scope.textTargets().find(t=>t.groupId===id),select(ids=['source'],objects=['object']){scope.tool='select';scope.selectedIds=ids;scope.selectedObjectIds=objects;scope.drawSelection();}};
}

test('actual coalesced touch handlers consume every sample but paint one affected wrapper per frame',()=>{
 const h=harness(),other=h.wrapper('other'),ink=h.$('ink').children,shape=h.scope.note.drawingObjects,before=plain(h.scope.note);h.send('pointerdown');const wrapper=h.wrapper('object'),clip=h.$('converted-ink').children[0],surface=wrapper.children[0],localBounds={...clip.children[0].attrs};h.reset();
 const samples=Array.from({length:19},(_,i)=>({clientX:131+i,clientY:141+i,pointerType:'touch'}));h.send('pointermove',160,170,{getCoalescedEvents:()=>samples});
 assert.equal(h.counts.moves,20);assert.equal(h.frames.size,1);assert.equal(wrapper.attrs.transform,undefined);assert.equal(h.counts.drawingRender,0);assert.equal(h.scope.note.convertedGroups[0].bounds.x,130);assert.equal(h.scope.history.past.length,0);assert.equal(h.counts.dirty,0);
 h.frame();assert.equal(wrapper.attrs.transform,'translate(30 40)');assert.equal(h.wrapper('object'),wrapper);assert.equal(h.wrapper('other'),other);assert.equal(h.$('ink').children,ink);assert.equal(h.counts.drawingRender,0);assert.equal(h.replacements.get('converted-ink')||0,0);assert.equal(h.replacements.get('ink')||0,0);assert.equal(h.counts.measure,0);
 assert.deepEqual(clip.children[0].attrs,localBounds);for(const key of ['x','y','width','height'])assert.equal(surface.attrs[key],localBounds[key]);assert.deepEqual(plain(h.target('object').bounds),{...localBounds,x:130,y:140});assert.equal(h.$('text-drag-outline').children[0].attrs.x,130);
 assert.deepEqual(plain(h.scope.note.drawingObjects),plain(shape));assert.deepEqual(plain(h.scope.note.strokes[1]),before.strokes[1]);assert.deepEqual(plain(h.scope.note.convertedGroups[1]),before.convertedGroups[1]);
});

test('pointerup synchronously paints its final endpoint, saves one undo, and invalidates queued callbacks',()=>{
 const h=harness(),before=plain(h.scope.note);h.send('pointerdown');h.reset();h.send('pointermove',150,155);const stale=[...h.callbacks.values()].at(-1);h.send('pointerup',180,190);
 assert.equal(h.frames.size,0);assert.equal(h.wrapper('object').attrs.transform,'translate(50 60)');assert.equal(h.target('object').bounds.x,150);assert.equal(h.scope.note.strokes[0].points[0].x,160);assert.equal(h.scope.history.past.length,1);assert.equal(h.counts.dirty,1);assert.equal(h.counts.auto,1);assert.equal(h.scope.drawing,null);assert.equal(h.$('text-drag-outline').children.length,0);const committed=plain(h.scope.note);stale();assert.deepEqual(plain(h.scope.note),committed);
 h.$('undo').onclick();assert.deepEqual(plain(h.scope.note),before);assert.equal(h.wrapper('object').attrs.transform,undefined);h.$('redo').onclick();assert.deepEqual(plain(h.scope.note),committed);assert.equal(h.wrapper('object').children[0].attrs.x,150);
});

for(const event of ['pointercancel','lostpointercapture'])for(const painted of [false,true])test(`${event} rolls back ${painted?'painted':'queued'} movement without saving or stale repaint`,()=>{
 const h=harness(),before=plain(h.scope.note);h.send('pointerdown');h.reset();h.send('pointermove',180,190);const stale=[...h.callbacks.values()].at(-1);if(painted)h.frame();h.send(event,180,190);const wrapper=h.wrapper('object');stale();h.send('pointerup',200,210);h.frame();
 assert.deepEqual(plain(h.scope.note),before);assert.equal(h.scope.history.past.length,0);assert.equal(h.counts.dirty,0);assert.equal(h.frames.size,0);assert.equal(h.wrapper('object'),wrapper);assert.equal(wrapper.attrs.transform,undefined);assert.equal(h.target('object').bounds.x,100);
});

test('successive drag gestures use the rendered base and do not double-translate earlier transforms',()=>{
 const h=harness();h.send('pointerdown');h.send('pointerup',160,150);assert.equal(h.target('object').bounds.x,130);h.send('pointerdown',150,140);h.send('pointermove',180,170);h.frame();assert.equal(h.wrapper('object').attrs.transform,'translate(60 50)');h.send('pointerup',180,170);assert.equal(h.target('object').bounds.x,160);assert.equal(h.scope.history.past.length,2);
});

for(const fontEvent of ['loadingdone','loadingerror'])test(`${fontEvent} cancels pending paint and reanchors the next transform without drift`,()=>{
 const h=harness();h.send('pointerdown');h.send('pointermove',160,170);const stale=[...h.callbacks.values()].at(-1);h.rootEvents.get('font:'+fontEvent)();assert.equal(h.frames.size,0);const wrapper=h.wrapper('object');assert.equal(wrapper.children[0].attrs.x,130);stale();assert.equal(wrapper.attrs.transform,undefined);
 h.send('pointermove',180,190);h.frame();assert.equal(wrapper.attrs.transform,'translate(20 20)');assert.equal(h.target('object').bounds.x,150);h.send('pointerup',190,200);assert.equal(wrapper.attrs.transform,'translate(30 30)');assert.equal(h.target('object').bounds.x,160);assert.equal(h.scope.history.past.length,1);
});

test('full page render cancels old-page callbacks and never transforms the replacement page',()=>{
 const h=harness();h.send('pointerdown');h.send('pointermove',170,180);const stale=[...h.callbacks.values()].at(-1);h.scope.endStroke();const next={...makeNote(),id:'next',convertedGroups:[{...h.original.convertedGroups[0],strokeIds:[]}]};h.scope.note=next;h.scope.renderInk();const wrapper=h.wrapper('object');h.reset();stale();h.frame();assert.equal(h.wrapper('object'),wrapper);assert.equal(wrapper.attrs.transform,undefined);assert.equal(h.counts.svg,0);assert.equal(h.scope.history.past.length,0);assert.equal(h.scope.note,next);
});

test('font editing and export-style endStroke cancellation restore the gesture before subsequent rendering',()=>{
 const h=harness(),before=plain(h.scope.note);h.send('pointerdown');h.send('pointermove',180,190);h.frame();h.scope.endStroke();h.scope.note.convertedGroups[0].font='PoorStory';h.scope.renderInk();h.frame();assert.equal(h.target('object').bounds.x,before.convertedGroups[0].bounds.x);assert.equal(h.wrapper('object').attrs.transform,undefined);assert.equal(h.wrapper('object').children[1].attrs['font-family'],'PoorStory, sans-serif');assert.equal(h.scope.history.past.length,0);
});

test('lasso-selected text with hidden provenance uses partial paint and preserves its selection outline',()=>{
 const h=harness();h.select();h.send('pointerdown',130,130,{pointerType:'pen'});h.reset();for(let i=1;i<=20;i++)h.send('pointermove',130+i,140+i,{pointerType:'pen'});assert.equal(h.frames.size,1);h.frame();assert.equal(h.counts.drawingRender,0);assert.equal(h.wrapper('object').attrs.transform,'translate(20 30)');assert.equal(h.$('selection-box').attrs.x,120);h.send('pointerup',170,180,{pointerType:'pen'});assert.equal(h.target('object').bounds.x,140);assert.equal(h.scope.history.past.length,1);
});

test('mixed lasso movement redraws the complete page only once per frame and flushes final raw coordinates',()=>{
 const h=harness();h.select(['source','visible']);h.send('pointerdown',130,130,{pointerType:'pen'});h.reset();for(let i=1;i<=20;i++)h.send('pointermove',130+i,140+i,{pointerType:'pen'});assert.equal(h.counts.drawingRender,0);assert.equal(h.frames.size,1);h.frame();assert.equal(h.counts.drawingRender,1);assert.equal(h.replacements.get('ink'),1);assert.equal(h.replacements.get('converted-ink'),1);assert.equal(h.scope.note.strokes[1].points[0].x,520);assert.equal(h.wrapper('object').attrs.transform,undefined);
 h.send('pointerup',170,180,{pointerType:'pen'});assert.equal(h.counts.drawingRender,2);assert.equal(h.scope.note.strokes[1].points[0].x,540);assert.equal(h.scope.history.past.length,1);assert.equal(h.frames.size,0);
});

test('source-free and shared-provenance text remain partial paints without changing an unrelated object',()=>{
 for(const shared of [false,true]){const h=harness();if(shared)h.scope.note.convertedGroups[1].strokeIds=['source'];else h.scope.note.convertedGroups[0].strokeIds=[];h.scope.renderInk();const other=h.wrapper('other'),unchanged=plain(h.scope.note.convertedGroups[1]);h.send('pointerdown');h.reset();h.send('pointermove',160,170);h.frame();assert.equal(h.counts.drawingRender,0);assert.equal(h.wrapper('other'),other);assert.equal(other.attrs.transform,undefined);assert.deepEqual(plain(h.scope.note.convertedGroups[1]),unchanged);h.send('pointerup',160,170);assert.equal(h.scope.history.past.length,1);}
});

test('tap threshold, foreign pointers, geometry interruption and return-to-origin keep previous semantics',()=>{
 {const h=harness(),before=plain(h.scope.note);h.send('pointerdown');h.send('pointermove',132,131);h.send('pointerup',132,131);h.frame();assert.deepEqual(plain(h.scope.note),before);assert.equal(h.scope.history.past.length,0);assert.equal(h.scope.tool,'select');}
 {const h=harness(),before=plain(h.scope.note);h.send('pointerdown');h.send('pointermove',300,300,{pointerId:8});assert.equal(h.frames.size,0);h.send('pointermove',160,170);h.rect.left=10;h.send('pointermove',180,190);h.frame();assert.deepEqual(plain(h.scope.note),before);assert.equal(h.scope.history.past.length,0);}
 {const h=harness();h.send('pointerdown');h.send('pointermove',160,170);h.frame();h.send('pointermove',130,130);h.frame();assert.equal(h.wrapper('object').attrs.transform,'translate(0 0)');assert.equal(h.target('object').bounds.x,100);h.send('pointercancel');assert.equal(h.scope.history.past.length,0);}
});


test('committed JSON roundtrip redraws durable final coordinates with no persisted preview transform',()=>{
 const h=harness();h.send('pointerdown');h.send('pointermove',160,170);h.frame();h.send('pointerup',180,190);const committed=plain(h.scope.note),restored=validateNote(JSON.parse(JSON.stringify(committed)));
 assert.deepEqual(plain(restored.convertedGroups),committed.convertedGroups);assert.deepEqual(plain(restored.strokes),committed.strokes);assert.deepEqual(plain(restored.drawingObjects),committed.drawingObjects);assert.equal(JSON.stringify(restored).includes('previewStrokeIds'),false);
 const fresh=harness();fresh.scope.note=restored;fresh.scope.renderInk();const wrapper=fresh.wrapper('object');assert.equal(wrapper.attrs.transform,undefined);assert.equal(wrapper.children[0].attrs.x,150);assert.equal(wrapper.children[0].attrs.y,160);assert.equal(wrapper.children[1].attrs.x,150);assert.deepEqual(plain(fresh.target('object').bounds),committed.convertedGroups[0].bounds);
});

test('actual preview and final commit clamp object plus provenance to all page edges',()=>{
 for(const [x,y,expectedX,expectedY]of [[900,1200,640,1040],[0,0,0,0]]){const h=harness(),before=plain(h.scope.note);h.send('pointerdown');h.send('pointermove',x,y);h.frame();assert.equal(h.target('object').bounds.x,expectedX);assert.equal(h.target('object').bounds.y,expectedY);assert.equal(h.wrapper('object').attrs.transform,`translate(${expectedX-100} ${expectedY-100})`);h.send('pointerup',x,y);assert.equal(h.scope.history.past.length,1);const group=h.scope.note.convertedGroups[0];assert.ok(group.bounds.x>=0&&group.bounds.y>=0&&group.bounds.x+group.bounds.width<=900&&group.bounds.y+group.bounds.height<=1200);assert.equal(h.scope.note.strokes[0].points[0].x,110+expectedX-100);assert.equal(h.scope.note.strokes[0].points[0].y,120+expectedY-100);assert.deepEqual(plain(h.scope.note.strokes[1]),before.strokes[1]);assert.deepEqual(plain(validateNote(plain(h.scope.note)).convertedGroups[0]),plain(group));}
});
