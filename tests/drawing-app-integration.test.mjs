import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeNote,validateNote,parseBackup,backupParts,History,PAGE} from '../src/core.js';
import {createPage,cloneImportedPages,pagesFor,notebookId} from '../src/notebooks.js';
import {createDrawingObject,updateDrawingObject,deleteDrawingObject,duplicateDrawingObject,drawDrawingObject} from '../src/drawing-objects.js';
import {mountDrawingTools} from '../src/drawing-tools.js';
import {mountPageSwipe} from '../src/page-swipe.js';
import {mountPaperViewport} from '../src/paper-viewport.js';
import {snapshotRect,inputPoint} from '../src/ink-input.js';
import {blankPaperPoint} from '../src/touch-hit.js';
import {renderPagePreview} from '../src/page-preview.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const piece=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`app source region: ${start}`);return source.slice(a,b)};
const object=(id='shape',type='rectangle',style={})=>createDrawingObject(type,{x:300,y:400},{x:700,y:700},{id,font:'Gaegu',fontSize:24,text:'도형 글',...style});
function page(){const n=makeNote();return {...n,title:'그림과 필기',paper:'grid',paperTheme:'blue-frame',cover:'ivory',strokes:[{id:'raw',width:3,color:'#223247',points:[{x:80,y:80,pressure:.2},{x:110,y:120,pressure:.8}]}],text:'기존 글',convertedGroups:[{kind:'text-object',id:'typed',strokeIds:[],text:'기존 글',font:'Gaegu',fontSize:24,bounds:{x:70,y:180,width:200,height:100}}],drawingObjects:[object()]};}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};

test('new and legacy notes default to independent empty drawing arrays',()=>{
 const first=makeNote(),second=makeNote();assert.deepEqual(first.drawingObjects,[]);assert.notEqual(first.drawingObjects,second.drawingObjects);
 const legacy=page();delete legacy.drawingObjects;const before=structuredClone(legacy),loaded=validateNote(legacy);assert.deepEqual(loaded.drawingObjects,[]);assert.deepEqual(legacy,before);assert.deepEqual(loaded.strokes,legacy.strokes);assert.deepEqual(loaded.convertedGroups,legacy.convertedGroups);
});
test('validateNote and JSON backup preserve shapes tables labels and source content without aliases',()=>{
 const n=page();n.drawingObjects.push(object('table','table',{rows:2,cols:2,cells:[['가\t나','<tag> & "'],['다\n라','🙂']],text:''}));
 const before=structuredClone(n),parts=backupParts([n],100000),restored=parts.flatMap(notes=>parseBackup(JSON.stringify({version:1,notes})));
 assert.deepEqual(restored[0],before);assert.deepEqual(n,before);assert.notEqual(restored[0].drawingObjects,n.drawingObjects);
 const loaded=validateNote(n);loaded.drawingObjects[0].bounds.x=1;loaded.drawingObjects[1].cells[0][0]='다름';assert.deepEqual(n,before);
});
test('drawing data is strictly rejected by both note validation and backup before source mutation',()=>{
 const n=page(),before=structuredClone(n),base=n.drawingObjects[0];
 const invalid=[null,{},[null],[{...base,id:'bad<id'}],[{...base,color:'url(https://invalid)'}],[{...base,font:'x" onload="bad'}],[{...base,bounds:{...base.bounds,x:NaN}}],[{...base,bounds:{...base.bounds,x:850}}],[{...base,text:'x'.repeat(2001)}],[base,base],Array.from({length:201},(_,i)=>({...base,id:'o'+i})),[{...base,type:'table',rows:2,cols:2,cells:[['one']]}]];
 for(const drawingObjects of invalid){assert.throws(()=>validateNote({...n,drawingObjects}));assert.throws(()=>parseBackup(JSON.stringify({version:1,notes:[{...n,drawingObjects}]})));}
 assert.deepEqual(n,before);
});
test('new sibling page is blank while notebook import clones drawing content and remaps only page identities',()=>{
 const n=page(),before=structuredClone(n),blank=createPage([n],n);assert.deepEqual(blank.drawingObjects,[]);assert.deepEqual(blank.strokes,[]);assert.deepEqual(blank.convertedGroups,[]);assert.equal(blank.notebookId,n.notebookId);assert.equal(blank.paperTheme,n.paperTheme);
 const cloned=cloneImportedPages([n,{...blank,drawingObjects:[object('second')]}]);assert.notEqual(cloned[0].id,n.id);assert.notEqual(cloned[0].notebookId,n.notebookId);assert.equal(cloned[0].notebookId,cloned[1].notebookId);assert.deepEqual(cloned[0].drawingObjects,n.drawingObjects);assert.deepEqual(cloned[0].convertedGroups,n.convertedGroups);
 cloned[0].drawingObjects[0].text='별도 복사';assert.deepEqual(n,before);
});
test('History restores object creation edit copy and deletion without changing original ink or text',()=>{
 let n=page();const initial=structuredClone(n),h=new History(),states=[structuredClone(n)];
 for(const update of [p=>({...p,drawingObjects:[...p.drawingObjects,object('new','ellipse')]}),p=>updateDrawingObject(p,'shape',{text:'수정\n두 줄',bounds:{x:340,y:430,width:350,height:250}}),p=>duplicateDrawingObject(p,'shape','copy'),p=>deleteDrawingObject(p,'shape')]){h.push(n);n=update(n);states.push(structuredClone(n));assert.deepEqual(n.strokes,initial.strokes);assert.deepEqual(n.convertedGroups,initial.convertedGroups);}
 for(let i=states.length-2;i>=0;i--){n=h.undo(n);assert.deepEqual(n,states[i]);}for(let i=1;i<states.length;i++){n=h.redo(n);assert.deepEqual(n,states[i]);}
});
test('object-only page thumbnails render drawing layer and escape shape/table text without external content',()=>{
 const n={...makeNote(),paper:'plain',drawingObjects:[object('shape','rectangle',{text:'<script>&"\'\u0001'}),object('table','table',{rows:1,cols:1,cells:[['<img> & "x"']],text:''})]},before=structuredClone(n),svg=renderPagePreview(n);
 assert.equal((svg.match(/data-preview-drawing/g)||[]).length,2);assert.doesNotMatch(svg,/data-preview-ink|data-preview-object|<script|<img|\u0001|href=|onload=/);assert.match(svg,/&lt;script&gt;&amp;&quot;&apos;/);assert.match(svg,/&lt;img&gt; &amp; &quot;x&quot;/);assert.deepEqual(n,before);
 assert.equal((renderPagePreview({...n,showOriginal:true}).match(/data-preview-drawing/g)||[]).length,2);
});
test('thumbnail drawing limit is bounded at 200 and never truncates saved source',()=>{
 const n={...makeNote(),drawingObjects:Array.from({length:201},(_,i)=>object('object'+i,'rectangle',{text:''}))};const svg=renderPagePreview(n);assert.equal((svg.match(/data-preview-drawing/g)||[]).length,200);assert.equal(n.drawingObjects.length,201);
});

// Event-capable DOM fake: capture listeners run before existing app listeners,
// and stopImmediatePropagation prevents simultaneous freehand drawing.
function dom(){
 const els=new Map(),buttons=[],rect={left:20,top:30,width:450,height:600};let root;
 function element(){return {hidden:true,value:'',checked:false,innerHTML:'',dataset:{},events:new Map(),style:{},classList:{values:new Set(),add(...names){names.forEach(n=>this.values.add(n))},remove(...names){names.forEach(n=>this.values.delete(n))},contains(n){return this.values.has(n)},toggle(n,on){if(on)this.values.add(n);else this.values.delete(n)}},setAttribute(k,v){this[k]=String(v)},replaceChildren(...children){this.children=children},contains(node){return node===this||node?.parentNode===this},addEventListener(type,fn,options){const capture=options===true||options?.capture===true;this.events.set(type,[...(this.events.get(type)||[]),{fn,capture,passive:options?.passive===true}])},removeEventListener(type,fn){this.events.set(type,(this.events.get(type)||[]).filter(listener=>listener.fn!==fn))},querySelectorAll(){return buttons},getBoundingClientRect:()=>rect,setPointerCapture(id){this.capture=id},hasPointerCapture(id){return this.capture===id},releasePointerCapture(id){if(this.capture===id)this.capture=null},click(){dispatch(this,'click',{})}};}
 const get=id=>{if(!els.has(id))els.set(id,element());return els.get(id)};
 function dispatch(el,type,extra={}){const e={target:el,button:0,isPrimary:true,pointerType:'pen',pointerId:7,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true},...extra};if(root&&el!==root){for(const {fn,capture} of root.events.get(type)||[]){if(capture)fn(e);if(e.stopped)return e}}const listeners=[...(el.events.get(type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture));for(const {fn} of listeners){fn(e);if(e.stopped)break}return e;}
 for(const drawingTool of ['select','freehand','line','arrow','rectangle','ellipse','triangle','diamond','table'])buttons.push({...element(),dataset:{drawingTool}});
 root=element();root.hidden=false;root.getElementById=get;return {root,get,buttons,dispatch,send:(type,x=100,y=100,extra={})=>dispatch(get('canvas'),type,{clientX:20+x/2,clientY:30+y/2,...extra}),choose:type=>dispatch(buttons.find(b=>b.dataset.drawingTool===type),'click'),click:id=>dispatch(get(id),'click'),rect};
}
function appHarness({nativeTouch=true,detectTouch=false}={}){
 const original=page(),other=page(),ui=dom(),counts={},history=new History(),hit=name=>()=>counts[name]=(counts[name]||0)+1;
 ui.root.scrollingElement={scrollTop:200};ui.root.documentElement={scrollTop:500};ui.root.defaultView=detectTouch?{ontouchstart:null}:{};ui.root.defaultView.visualViewport={scale:1,addEventListener(){},removeEventListener(){}};ui.get('canvas').ownerDocument=ui.root;
 ui.root.querySelector=()=>null;ui.root.defaultView.addEventListener=()=>{};ui.root.defaultView.removeEventListener=()=>{};ui.get('paper-viewport').contains=t=>t===ui.get('canvas');ui.get('paper-viewport').clientWidth=450;ui.get('paper-viewport').clientHeight=400;ui.get('page').offsetWidth=450;ui.get('page').offsetHeight=600;
 const scope={snapshotRect,inputPoint,paperViewport:null,mountPaperViewport:options=>mountPaperViewport({...options,win:ui.root.defaultView}),autoEngine:{setWriting:hit('writing')},renderInk:hit('renderInk'),drawDirectOutline:hit('outline'),buttons:hit('buttons'),document:ui.root,note:original,notes:[original,other],drawing:null,drawingTools:null,pageSwipe:null,tool:'pen',switching:false,history,activeRecognition:{noteId:original.id,controller:{abort:hit('abort')}},recognitionResults:new Map([[original.id,'result'],[other.id,'other']]),retryWarnings:new Set([original.id,other.id]),converted:new Map([[original.id,'result'],[other.id,'other']]),clearSelection:hit('clear'),autoChanged:hit('auto'),dirty(){hit('dirty')();scope.notes=scope.notes.map(n=>n.id===scope.note.id?scope.note:n)},render(){hit('render')();scope.drawingTools?.render()},stopAuto:hit('stop'),toast:hit('toast'),pagesFor,notebookId,blankPaperPoint,textTargets:()=>scope.note.showOriginal?[]:scope.note.convertedGroups.map(g=>({groupId:g.id,strokeIds:g.strokeIds,bounds:g.bounds})),switchNote:async id=>{scope.note=scope.notes.find(n=>n.id===id)},effectiveFont:()=>original.font,showEraser:hit('eraser'),$:ui.get,fetch(){throw Error('Drawing must not use a network request')},mountDrawingTools(options){scope.options=options;return mountDrawingTools({...options,root:ui.root})},mountPageSwipe(options){scope.swipeOptions=options;return mountPageSwipe({...options,root:ui.root,...(detectTouch?{}:{nativeTouch})})}};
 ui.get('width').value='3';ui.get('color').value='#223247';ui.get('pan-page').checked=true;
 vm.createContext(scope);vm.runInContext(piece('function endStroke(','function appendSamples('),scope);
 // Install the actual legacy pointer-cancel handlers before the drawing module.
 vm.runInContext(piece("for(const name of ['pointercancel','lostpointercapture'])","\n"),scope);
 vm.runInContext(piece('const activePenPointers=',"$('pan-page').onchange="),scope);
 vm.runInContext(piece('drawingTools=mountDrawingTools({','mountKeyboardText({'),scope);
 return {scope,ui,counts,history,original,other};
}
test('actual app mount apply preserves page ink text and siblings with one undo; aborts only stale current OCR',()=>{
 const h=appHarness(),before=structuredClone(h.original),otherBefore=structuredClone(h.other),request=h.scope.activeRecognition;
 const next=updateDrawingObject(h.original,'shape',{text:'바뀐 도형'});assert.equal(h.scope.options.apply(next,'도형 수정'),true);
 assert.equal(h.scope.note.id,before.id);assert.equal(h.scope.note.notebookId,before.notebookId);assert.equal(h.scope.note.title,before.title);assert.deepEqual(h.scope.note.strokes,before.strokes);assert.deepEqual(h.scope.note.convertedGroups,before.convertedGroups);assert.deepEqual(h.other,otherBefore);assert.equal(h.history.past.length,1);assert.deepEqual(h.history.undo(h.scope.note),before);
 assert.equal(request.discardResult,true);for(const key of ['abort','auto','dirty','render'])assert.equal(h.counts[key],1,key);for(const cache of [h.scope.recognitionResults,h.scope.retryWarnings,h.scope.converted]){assert.equal(cache.has(before.id),false);assert.equal(cache.has(h.other.id),true)}assert.equal(h.ui.get('auto-status').textContent,'도형 수정');
});
test('actual app rejects stale-page apply before undo cache invalidation or saving',()=>{
 const h=appHarness(),before=structuredClone(h.original);assert.equal(h.scope.options.apply({...h.original,id:h.other.id,drawingObjects:[]}),false);assert.deepEqual(h.scope.note,before);assert.equal(h.history.past.length,0);assert.deepEqual(h.counts,{});assert.equal(h.scope.recognitionResults.has(before.id),true);
});
test('drawing change does not abort recognition belonging to another page',()=>{
 const h=appHarness();h.scope.activeRecognition.noteId=h.other.id;h.scope.options.apply(updateDrawingObject(h.original,'shape',{text:'현재 도형'}));assert.equal(h.counts.abort,undefined);assert.equal(h.scope.activeRecognition.discardResult,undefined);
});
test('real drawing gesture runs actual app callback once without freehand events or content replacement',async()=>{
 const h=appHarness(),before=structuredClone(h.original);let leaked=0;for(const type of ['pointerdown','pointermove','pointerup'])h.ui.get('canvas').addEventListener(type,()=>leaked++);
 h.ui.click('open-drawing');h.ui.choose('ellipse');h.ui.send('pointerdown',100,800);h.ui.send('pointermove',250,1000);assert.deepEqual(h.scope.note,before);assert.equal(h.history.past.length,0);assert.ok(h.ui.get('drawing-preview').innerHTML);
 h.ui.send('pointerup',250,1000);await settle();assert.equal(leaked,0);assert.equal(h.scope.note.drawingObjects.length,2);assert.equal(h.scope.note.drawingObjects[1].type,'ellipse');assert.equal(h.history.past.length,1);assert.equal(h.counts.dirty,1);assert.deepEqual(h.scope.note.strokes,before.strokes);assert.deepEqual(h.scope.note.convertedGroups,before.convertedGroups);assert.equal(h.ui.get('pan-page').checked,false);
});
test('actual endStroke cancels independent shape gestures even when no ink drawing exists',async()=>{
 const h=appHarness(),before=structuredClone(h.original);h.ui.click('open-drawing');h.ui.choose('rectangle');h.ui.send('pointerdown',100,800);h.ui.send('pointermove',250,1000);assert.ok(h.ui.get('drawing-preview').innerHTML);assert.equal(h.scope.drawing,null);h.scope.endStroke();assert.equal(h.ui.get('drawing-preview').innerHTML,'');h.ui.send('pointerup',250,1000);await settle();assert.deepEqual(h.scope.note,before);assert.equal(h.history.past.length,0);
});
test('pointercancel and lost capture discard preview without committing or reviving on pointerup',async()=>{
 for(const event of ['pointercancel','lostpointercapture']){const h=appHarness(),before=structuredClone(h.original);h.ui.click('open-drawing');h.ui.choose('rectangle');h.ui.send('pointerdown',100,800);h.ui.send('pointermove',250,1000);h.ui.send(event,250,1000);h.ui.send('pointerup',250,1000);await settle();assert.deepEqual(h.scope.note,before);assert.equal(h.ui.get('drawing-preview').innerHTML,'');assert.equal(h.history.past.length,0);assert.equal(h.counts.dirty,undefined);}
});
test('same-page intervening text edit prevents stale drawing gesture from overwriting content',async()=>{
 const h=appHarness();h.ui.click('open-drawing');h.ui.choose('rectangle');h.ui.send('pointerdown',100,800);h.ui.send('pointermove',250,1000);h.scope.note={...h.scope.note,text:'들어온 편집',convertedGroups:[{...h.scope.note.convertedGroups[0],text:'들어온 편집'}]};h.ui.send('pointerup',250,1000);await settle();assert.equal(h.scope.note.text,'들어온 편집');assert.equal(h.scope.note.drawingObjects.length,1);assert.equal(h.history.past.length,0);
});
test('switching existing tools deactivates drawing palette before their click actions',()=>{
 for(const id of ['pen','eraser','select','keyboard-text','edit-text','open-pen','pan-page']){const h=appHarness();h.ui.click('open-drawing');assert.equal(h.scope.drawingTools.isActive(),true);h.ui.click(id);assert.equal(h.scope.drawingTools.isActive(),false,id);assert.equal(h.ui.get('drawing-palette').hidden,true);}
});

function pngHarness(){
 const events=[],n=page(),ctx=new Proxy({},{get(target,key){if(key in target)return target[key];return (...args)=>events.push([key,...args])},set(target,key,value){events.push(['set',key,value]);target[key]=value;return true}}),canvas={getContext:type=>{assert.equal(type,'2d');return ctx}},raw={recognitionOnly:true};
 const scope={note:n,PAGE,structuredClone,document:{createElement:tag=>{assert.equal(tag,'canvas');return canvas},fonts:{load:async font=>events.push(['load',font])}},drawPaperBackground:()=>events.push(['paper']),visibleGroups:()=>n.convertedGroups,drawStyledStroke:(_ctx,stroke)=>events.push(['ink',stroke.id]),displayPoints:s=>s.points,groupFont:g=>g.font,resolvedFont:f=>f,groupLayout:g=>({rows:[{bounds:g.bounds,fontSize:g.fontSize,lineHeight:30,lines:[g.text]}]}),drawDrawingObject:(context,o)=>{events.push(['drawing',o.id]);drawDrawingObject(context,o)},recognitionCanvas:()=>raw};vm.createContext(scope);vm.runInContext(piece('async function imageCanvas(',"$('export-png')"),scope);return {scope,events,n,canvas,raw};
}
test('actual PNG export draws paper then raw ink text and drawing objects using Canvas renderer',async()=>{
 const h=pngHarness(),before=structuredClone(h.n),result=await h.scope.imageCanvas();assert.equal(result,h.canvas);assert.equal(result.width,900);assert.equal(result.height,1200);
 const index=kind=>h.events.findIndex(e=>e[0]===kind);assert.ok(index('paper')<index('ink'));assert.ok(index('ink')<index('fillText'));assert.ok(index('fillText')<index('drawing'));assert.ok(h.events.some(e=>e[0]==='fillText'&&e[1]==='도형 글'));assert.ok(h.events.some(e=>e[0]==='load'&&e[1]==='24px Gaegu'));assert.deepEqual(h.n,before);
});
test('recognition image branch remains raw-ink-only and never renders shapes or their text',async()=>{
 const h=pngHarness();assert.equal(await h.scope.imageCanvas(true),h.raw);assert.deepEqual(h.events,[]);const recognition=piece('function recognitionCanvas(','async function imageCanvas(');assert.doesNotMatch(recognition,/drawingObjects|drawDrawingObject|objectSVG/);
});
test('object-only page is not treated as empty and drawing modules/layers are wired and cached offline',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');for(const id of ['open-drawing','drawing-palette','drawing-objects','drawing-preview'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
 assert.match(html,/id="open-drawing"[^>]*aria-expanded="false"[^>]*aria-controls="drawing-palette"/);assert.match(html,/id="drawing-objects" pointer-events="none"/);assert.match(html,/id="drawing-preview" pointer-events="none"/);
 for(const name of ['drawing-tools','drawing-objects'])assert.match(sw,new RegExp(`'\\./src/${name}\\.js'`));
 const els={undo:{},redo:{},'empty-hint':{}},scope={history:new History(),note:{...makeNote(),drawingObjects:[object()]},drawing:null,isWriting:()=>true,activeConvertedGroups:()=>[],$:id=>els[id]};vm.createContext(scope);vm.runInContext(piece('function buttons()','\n'),scope);scope.buttons();assert.equal(els['empty-hint'].hidden,true);
});


test('actual revision guard rejects an in-flight OCR result after applying a drawing change',()=>{
 const h=appHarness();h.scope.inkRevision=17;h.scope.autoEngine=null;h.scope.selectionEpoch=0;
 vm.runInContext(piece('function autoChanged()','\n'),h.scope);
 vm.runInContext(piece('function applyRecognized(','async function convertOnce('),h.scope);
 const snapshot={noteId:h.original.id,revision:17,fullStrokesKey:JSON.stringify(h.original.strokes)};
 h.scope.options.apply(updateDrawingObject(h.original,'shape',{text:'새 도형 글'}));const after=structuredClone(h.scope.note);
 assert.equal(h.scope.inkRevision,18);assert.equal(h.scope.applyRecognized('늦은 AI 결과',snapshot),false);assert.deepEqual(h.scope.note,after);assert.equal(h.history.past.length,1);
});
test('PNG keeps the starting page drawing layer while async fonts load across a page switch',async()=>{
 const h=pngHarness();let release;const gate=new Promise(resolve=>release=resolve);let first=true;
 h.scope.document.fonts.load=async()=>{if(first){first=false;await gate}};
 const pending=h.scope.imageCanvas();h.scope.note={...makeNote(),drawingObjects:[object('other-page')]};release();await pending;
 assert.deepEqual(h.events.filter(e=>e[0]==='drawing').map(e=>e[1]),['shape']);
});
test('PNG download filename is captured before export/font/blob awaits and page switching',async()=>{
 let release,blobCallback;const pending=new Promise(resolve=>release=resolve),button={},downloads=[],scope={note:{title:'Starting page'},endStroke(){},imageCanvas:()=>pending,$:()=>button,download:(blob,name)=>downloads.push(name),toast(){}};
 vm.createContext(scope);vm.runInContext(piece("$('export-png').onclick=",'\n'),scope);
 const operation=button.onclick();scope.note={title:'Switched page'};release({toBlob(callback){blobCallback=callback}});await operation;scope.note={title:'Third page'};blobCallback({});assert.deepEqual(downloads,['Starting page.png']);
});


test('aggregate drawing label limit is enforced through backup without silently discarding objects',()=>{
 const n={...makeNote(),drawingObjects:Array.from({length:25},(_,i)=>object('label'+i,'rectangle',{text:'가'.repeat(2000)}))};
 assert.equal(parseBackup(JSON.stringify({version:1,notes:[n]}))[0].drawingObjects.length,25);
 const tooLarge={...n,drawingObjects:[...n.drawingObjects,object('excess','ellipse',{text:'한'})]};
 assert.throws(()=>validateNote(tooLarge));assert.throws(()=>parseBackup(JSON.stringify({version:1,notes:[tooLarge]})));assert.equal(tooLarge.drawingObjects.length,26);
});
test('drawing font fallback is shared by SVG thumbnails and actual PNG Canvas text',async()=>{
 const h=pngHarness(),font='custom_'+'a'.repeat(64);h.n.drawingObjects[0].font=font;h.scope.resolvedFont=()=> 'NanumPenScript';await h.scope.imageCanvas();
 assert.ok(h.events.some(e=>e[0]==='set'&&e[1]==='font'&&e[2].includes(font+', NanumPenScript, sans-serif')));
 assert.match(renderPagePreview(h.n),new RegExp(`font-family="${font}, NanumPenScript, sans-serif"`));
});

test('opening drawing from page pan removes scroll permission before first touch starts',async()=>{const h=appHarness(),canvas=h.ui.get('canvas');canvas.classList.add('page-pan');h.ui.get('touch').disabled=true;h.ui.click('open-drawing');assert.equal(h.ui.get('pan-page').checked,false);assert.equal(canvas.classList.contains('page-pan'),false);assert.equal(h.ui.get('touch').disabled,false);for(const type of ['line','rectangle']){h.ui.choose(type);const e=h.ui.send('pointerdown',50,500,{pointerType:'touch'});assert.equal(e.defaultPrevented,true);h.ui.send('pointermove',150,650,{pointerType:'touch'});h.ui.send('pointerup',150,650,{pointerType:'touch'});await settle();}assert.equal(h.history.past.length,2);});

test('drawing touch policy is set before down and released for pen, eraser and navigation',()=>{for(const next of ['pen','eraser','select','pan-page','keyboard-text']){const h=appHarness();h.ui.click('open-drawing');h.ui.choose('arrow');assert.equal(h.ui.get('canvas')['data-drawing-active'],'true');h.ui.click(next);assert.equal(h.ui.get('canvas')['data-drawing-active'],'false',next);}assert.match(readFileSync('src/styles.css','utf8'),/#canvas\[data-drawing-active="true"\]\{touch-action:none/);assert.match(readFileSync('src/drawing-tools.js','utf8'),/capture:true,passive:false/);});
test('explicit page navigation remains available after drawing and reopening drawing clears it',()=>{const h=appHarness();h.scope.toast=()=>{};h.scope.tool='pen';vm.runInContext(piece("$('pan-page').onchange=", "$('touch').onchange="),h.scope);h.ui.click('open-drawing');h.ui.click('pan-page');h.ui.get('pan-page').checked=true;h.ui.get('pan-page').onchange();assert.equal(h.ui.get('canvas').classList.contains('page-pan'),true);assert.equal(h.ui.get('touch').disabled,true);h.ui.click('open-drawing');assert.equal(h.ui.get('canvas').classList.contains('page-pan'),false);assert.equal(h.ui.get('touch').disabled,false);});
test('browser interruption reports cancellation and next drawing gesture still works',async()=>{const h=appHarness();h.ui.click('open-drawing');h.ui.choose('line');h.ui.send('pointerdown',30,500,{pointerType:'touch'});h.ui.send('pointermove',100,500,{pointerType:'touch'});h.ui.send('pointercancel',100,500,{pointerType:'touch'});assert.match(h.ui.get('drawing-status').textContent,/중단/);assert.equal(h.history.past.length,0);h.ui.send('pointerdown',30,700,{pointerType:'touch'});h.ui.send('pointerup',130,700,{pointerType:'touch'});await settle();assert.equal(h.history.past.length,1);});


function navigationHarness(options={}){
 const h=appHarness(options),previous={...makeNote(),notebookId:h.original.notebookId,pageOrder:0},next={...makeNote(),notebookId:h.original.notebookId,pageOrder:2};
 h.original.pageOrder=1;h.scope.notes=[h.other,next,h.original,previous];h.ui.get('pan-page').checked=false;h.ui.get('touch').checked=false;
 h.navigations=[];h.scope.switchNote=async id=>{h.navigations.push(id);if(h.navigationGate)await h.navigationGate;if(h.saveFails)return false;h.scope.note=h.scope.notes.find(n=>n.id===id);h.scope.drawingTools.render();return true};
 vm.runInContext(piece("$('previous-page').onclick=", "$('add-page').onclick="),h.scope);
 h.created=[];h.ui.get('add-page').onclick=async()=>{const page=createPage(h.scope.notes,h.scope.note);h.scope.notes.push(page);h.scope.note=page;h.created.push(page.id)};h.previous=previous;h.next=next;return h;
}
function finger(h,type,x,y,extra={}){return h.ui.send(type,x,y,{pointerType:'touch',width:10,height:10,...extra})}

test('default pen finger drags existing drawing immediately with palette closed one undo and no page flip',async()=>{
 const h=navigationHarness(),before=structuredClone(h.scope.note);const down=finger(h,'pointerdown',400,500);assert.equal(down.defaultPrevented,true);assert.equal(h.scope.drawingTools.hasGesture(),true);assert.equal(h.scope.pageSwipe.hasGesture(),false);assert.equal(h.ui.get('drawing-palette').hidden,true);
 finger(h,'pointermove',600,550);assert.ok(h.ui.get('drawing-preview').innerHTML);assert.deepEqual(h.scope.note,before);finger(h,'pointerup',600,550);await settle();
 assert.equal(h.scope.note.id,before.id);assert.deepEqual(h.navigations,[]);assert.equal(h.history.past.length,1);assert.equal(h.scope.note.drawingObjects[0].bounds.x,before.drawingObjects[0].bounds.x+200);assert.equal(h.scope.note.drawingObjects[0].bounds.y,before.drawingObjects[0].bounds.y+50);assert.equal(h.ui.get('drawing-palette').hidden,true);assert.equal(h.scope.drawingTools.isActive(),false);assert.deepEqual(h.scope.note.strokes,before.strokes);assert.deepEqual(h.scope.note.convertedGroups,before.convertedGroups);assert.deepEqual(h.history.undo(h.scope.note),before);
});


test('finger tap on existing drawing opens its selected palette without edit undo or page flip',async()=>{
 const h=navigationHarness(),before=structuredClone(h.scope.note);finger(h,'pointerdown',400,500);finger(h,'pointerup',402,502);await settle();assert.equal(h.ui.get('drawing-palette').hidden,false);assert.equal(h.scope.drawingTools.isActive(),true);assert.equal(h.ui.get('drawing-edit').hidden,false);assert.equal(h.ui.get('drawing-label').value,'도형 글');assert.equal(h.ui.get('open-drawing')['aria-expanded'],'true');assert.equal(h.history.past.length,0);assert.deepEqual(h.scope.note,before);assert.deepEqual(h.navigations,[]);
});


test('direct drawing touch is disabled by finger writing eraser lasso pan and page transition',()=>{
 for(const configure of [h=>h.ui.get('touch').checked=true,h=>h.scope.tool='eraser',h=>h.scope.tool='select',h=>h.ui.get('pan-page').checked=true,h=>h.scope.switching=true]){const h=navigationHarness();configure(h);finger(h,'pointerdown',400,500);assert.equal(h.scope.drawingTools.hasGesture(),false);finger(h,'pointerup',600,500);assert.deepEqual(h.navigations,[]);assert.equal(h.history.past.length,0);}
});


test('direct-touch cancellation capture loss second touch and Pencil interruption never commit or page flip',async()=>{
 for(const interrupt of [h=>finger(h,'pointercancel',550,520),h=>finger(h,'lostpointercapture',550,520),h=>finger(h,'pointerdown',550,520,{pointerId:8}),h=>h.ui.send('pointerdown',550,520,{pointerType:'pen',pointerId:8}),h=>h.scope.endStroke()]){const h=navigationHarness(),before=structuredClone(h.scope.note);finger(h,'pointerdown',400,500);finger(h,'pointermove',550,520);assert.ok(h.ui.get('drawing-preview').innerHTML);interrupt(h);finger(h,'pointerup',600,550);await settle();assert.deepEqual(h.scope.note,before);assert.equal(h.scope.drawingTools.hasGesture(),false);assert.equal(h.ui.get('drawing-preview').innerHTML,'');assert.deepEqual(h.navigations,[]);assert.equal(h.history.past.length,0);}
});


test('touch navigation helper and controller are included in offline shell cache',()=>{
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');for(const name of ['touch-hit','page-swipe'])assert.match(sw,new RegExp(`'\\./src/${name}\\.js'`));
});



function contact(h,id,x,y,extra={}){return {identifier:id,target:h.ui.get('canvas'),clientX:20+x/2,clientY:30+y/2,radiusX:5,radiusY:5,touchType:'direct',...extra};}
function pair(h,dx=0,dy=0){return [contact(h,42,600+dx,800+dy),contact(h,43,760+dx,800+dy)];}
function touch(h,type,touches,changedTouches=touches,target=h.ui.get('canvas')){return h.ui.dispatch(target,type,{cancelable:true,touches,targetTouches:touches,changedTouches});}
function twoPan(h){const start=pair(h),last=pair(h,0,-120);touch(h,'touchstart',start);touch(h,'touchmove',last);touch(h,'touchend',[],last);}
function singleSwipe(h,x=800,y=850,dx=-350){const first=[contact(h,42,x,y)],last=[contact(h,42,x+dx,y)];touch(h,'touchstart',first);touch(h,'touchmove',last);touch(h,'touchend',[],last);}
test('long blank-paper drag calls the shared add button once and preserves all old pages',async()=>{
 const h=navigationHarness(),before=structuredClone(h.scope.notes);h.scope.note=h.next;singleSwipe(h);await settle();assert.equal(h.created.length,1);assert.equal(h.scope.note.id,h.created[0]);assert.equal(h.scope.note.notebookId,h.original.notebookId);assert.deepEqual(h.scope.notes.slice(0,-1),before);assert.equal(h.ui.root.scrollingElement.scrollTop,200);
});
test('right drag visits previous pages; left drag visits the immediate next page before adding at the end',async()=>{
 const h=navigationHarness(),before=structuredClone(h.scope.notes);singleSwipe(h,100,850,350);await settle();assert.equal(h.scope.note.id,h.previous.id);singleSwipe(h,100,850,350);await settle();assert.equal(h.scope.note.id,h.previous.id);assert.equal(h.navigations.length,1);
 singleSwipe(h);await settle();assert.equal(h.scope.note.id,h.original.id);assert.equal(h.ui.get('page-add-hint').textContent,'놓으면 다음 페이지로 이동');singleSwipe(h);await settle();assert.equal(h.scope.note.id,h.next.id);assert.deepEqual(h.created,[]);assert.deepEqual(h.scope.notes,before);
 singleSwipe(h);await settle();assert.equal(h.created.length,1);assert.equal(h.scope.notes.length,before.length+1);assert.equal(h.scope.note.id,h.created[0]);
});
test('previous navigation waits for saving, rejects repeated swipes and preserves data on failure',async()=>{
 const h=navigationHarness(),before=structuredClone(h.scope.notes);let release;h.navigationGate=new Promise(r=>release=r);h.saveFails=true;singleSwipe(h,100,850,350);singleSwipe(h);assert.equal(h.navigations.length,1);assert.equal(h.scope.note.id,h.original.id);release();await settle();assert.deepEqual(h.scope.notes,before);assert.equal(h.scope.note.id,h.original.id);h.saveFails=false;singleSwipe(h,100,850,350);await settle();assert.equal(h.scope.note.id,h.previous.id);assert.deepEqual(h.created,[]);
});
test('at page capacity navigation still works while last-page creation is unavailable',async()=>{
 const h=navigationHarness();h.scope.note=h.next;while(h.scope.notes.length<1000)h.scope.notes.push({...makeNote(),notebookId:'other-book'});singleSwipe(h);await settle();assert.deepEqual(h.created,[]);assert.equal(h.scope.note.id,h.next.id);singleSwipe(h,100,850,350);await settle();assert.equal(h.scope.note.id,h.original.id);singleSwipe(h);await settle();assert.equal(h.scope.note.id,h.next.id);assert.equal(h.scope.notes.length,1000);
});
test('one-finger short or vertical movement stays fixed without page creation',async()=>{const h=navigationHarness(),before=structuredClone(h.scope.notes);for(const [dx,dy]of [[-100,0],[0,-300]]){const a=[contact(h,42,800,850)],b=[contact(h,42,800+dx,850+dy)];touch(h,'touchstart',a);touch(h,'touchmove',b);touch(h,'touchend',[],b);}await settle();assert.deepEqual(h.created,[]);assert.deepEqual(h.scope.notes,before);assert.equal(h.scope.paperViewport.snapshot().y,0);});
test('long drag over visible ink text or drawing never creates a page',async()=>{for(const [x,y]of [[90,100],[100,220],[400,500]]){const h=navigationHarness();singleSwipe(h,x,y);await settle();assert.deepEqual(h.created,[]);assert.deepEqual(h.navigations,[]);}});
test('finger drawing, eraser, lasso and drawing palette exclude single-finger creation',async()=>{for(const setup of [h=>h.ui.get('touch').checked=true,h=>h.scope.tool='eraser',h=>h.scope.tool='select',h=>h.ui.click('open-drawing')]){const h=navigationHarness();setup(h);singleSwipe(h);await settle();assert.deepEqual(h.created,[]);assert.deepEqual(h.navigations,[]);}});
test('two fingers move only the paper and never turn pages or change note data',async()=>{const h=navigationHarness(),before=structuredClone(h.scope.notes);twoPan(h);await settle();assert.equal(h.scope.paperViewport.snapshot().y,-60);assert.deepEqual(h.scope.notes,before);assert.deepEqual(h.navigations,[]);assert.deepEqual(h.created,[]);assert.equal(h.ui.root.scrollingElement.scrollTop,200);assert.equal(h.history.past.length,0);});
test('pinch over content enlarges paper without browser zoom',()=>{const h=navigationHarness(),start=pair(h),end=[contact(h,42,520,800),contact(h,43,840,800)];touch(h,'touchstart',start);assert.equal(touch(h,'touchmove',end).defaultPrevented,true);touch(h,'touchend',[],end);assert.equal(h.scope.paperViewport.snapshot().scale,2);assert.equal(h.ui.root.defaultView.visualViewport.scale,1);assert.deepEqual(h.created,[]);});
test('first finger drawing preview is restored when the second finger starts paper zoom',async()=>{const h=navigationHarness(),before=structuredClone(h.scope.note);finger(h,'pointerdown',400,500);touch(h,'touchstart',[contact(h,42,400,500)]);finger(h,'pointermove',450,530);assert.ok(h.ui.get('drawing-preview').innerHTML);const joined=[contact(h,42,450,530),contact(h,43,600,530)];touch(h,'touchstart',joined,[joined[1]]);assert.equal(h.scope.drawingTools.hasGesture(),false);assert.equal(h.ui.get('drawing-preview').innerHTML,'');const pinched=[contact(h,42,400,530),contact(h,43,700,530)];touch(h,'touchmove',pinched);touch(h,'touchend',[],pinched);finger(h,'pointerup',450,530);await settle();assert.deepEqual(h.scope.note,before);assert.deepEqual(h.created,[]);assert.equal(h.history.past.length,0);});
test('two-touch beforeStart discards pending finger ink and restores provisional text move',()=>{for(const kind of ['ink','text']){const h=navigationHarness(),before=structuredClone(h.scope.note);if(kind==='ink'){h.scope.drawing={id:'pending',pointerId:9,width:3,color:'#223247',points:[{x:300,y:500}]};}else{h.scope.note=structuredClone(before);h.scope.note.convertedGroups[0].bounds.x+=40;h.scope.drawing={kind:'move',changed:true,directTouch:true,pointerId:9,before};}h.ui.get('canvas').setPointerCapture(9);touch(h,'touchstart',pair(h));assert.equal(h.scope.drawing,null);assert.equal(h.ui.get('canvas').hasPointerCapture(9),false);assert.deepEqual(h.scope.note,before);assert.equal(h.history.past.length,0);touch(h,'touchcancel',[],pair(h));}});
test('active Pencil ink and Pencil shape reject palm viewport gestures without cancelling the pen',()=>{for(const shape of [false,true]){const h=navigationHarness(),before=structuredClone(h.scope.note);if(shape){h.ui.click('open-drawing');h.ui.choose('line');h.ui.send('pointerdown',200,600,{pointerType:'pen',pointerId:99});h.ui.send('pointermove',300,650,{pointerType:'pen',pointerId:99});}else{h.ui.dispatch(h.ui.get('canvas'),'pointerdown',{pointerType:'pen',pointerId:99});h.scope.drawing={id:'pending-pen',pointerId:99,points:[{x:200,y:600}]};}const pending=h.scope.drawing;twoPan(h);assert.equal(h.scope.drawing,pending);assert.equal(h.scope.paperViewport.snapshot().y,0);assert.deepEqual(h.scope.note,before);assert.equal(h.history.past.length,0);}});
test('cancelled and mismatched-page drags do not create or modify pages',async()=>{for(const action of [h=>touch(h,'touchcancel',[],[]),h=>h.scope.note=h.next,h=>h.scope.endStroke()]){const h=navigationHarness(),before=structuredClone(h.scope.notes);touch(h,'touchstart',[contact(h,42,800,850)]);action(h);touch(h,'touchend',[],[contact(h,42,450,850)]);await settle();assert.deepEqual(h.created,[]);assert.deepEqual(h.scope.notes,before);}});
test('all canvas policies own gestures before contact and print removes display transforms',()=>{const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8'),rules=[...css.matchAll(/([^{}]+)\{([^{}]*touch-action:[^{}]*)\}/g)].filter(m=>m[1].includes('#canvas'));assert.ok(rules.length>=3);for(const rule of rules)assert.match(rule[2],/touch-action:none(?:;|$)/);assert.match(css,/#page\{transform:none!important/);assert.match(css,/body\{position:fixed;inset:0;touch-action:none/);});
