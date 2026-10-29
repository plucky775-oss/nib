import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeNote,validateNote,parseBackup,backupParts,History,PAGE} from '../src/core.js';
import {createPage,cloneImportedPages} from '../src/notebooks.js';
import {createDrawingObject,updateDrawingObject,deleteDrawingObject,duplicateDrawingObject,drawDrawingObject} from '../src/drawing-objects.js';
import {mountDrawingTools} from '../src/drawing-tools.js';
import {renderPagePreview} from '../src/page-preview.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const piece=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`app source region: ${start}`);return source.slice(a,b)};
const object=(id='shape',type='rectangle',style={})=>createDrawingObject(type,{x:300,y:400},{x:700,y:700},{id,font:'Gaegu',fontSize:24,text:'도형 글',...style});
function page(){const n=makeNote();return {...n,title:'그림과 필기',paper:'grid',paperTheme:'blue-frame',cover:'ivory',strokes:[{id:'raw',width:3,color:'#223247',points:[{x:80,y:80,pressure:.2},{x:110,y:120,pressure:.8}]}],text:'기존 글',convertedGroups:[{kind:'text-object',id:'typed',strokeIds:[],text:'기존 글',font:'Gaegu',fontSize:24,bounds:{x:70,y:180,width:200,height:100}}],drawingObjects:[object()]};}
const settle=async()=>{await Promise.resolve();await Promise.resolve()};

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
 const els=new Map(),buttons=[],rect={left:20,top:30,width:450,height:600};
 function element(){return {hidden:true,value:'',checked:false,innerHTML:'',dataset:{},events:new Map(),style:{},classList:{remove(){}},setAttribute(k,v){this[k]=String(v)},replaceChildren(){},addEventListener(type,fn,options){const capture=options===true||options?.capture===true;this.events.set(type,[...(this.events.get(type)||[]),{fn,capture}])},querySelectorAll(){return buttons},getBoundingClientRect:()=>rect,setPointerCapture(id){this.capture=id},hasPointerCapture(id){return this.capture===id},releasePointerCapture(id){if(this.capture===id)this.capture=null},click(){dispatch(this,'click',{})}};}
 const get=id=>{if(!els.has(id))els.set(id,element());return els.get(id)};
 function dispatch(el,type,extra={}){const e={button:0,isPrimary:true,pointerType:'pen',pointerId:7,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true},...extra};const listeners=[...(el.events.get(type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture));for(const {fn} of listeners){fn(e);if(e.stopped)break}return e;}
 for(const drawingTool of ['select','freehand','line','arrow','rectangle','ellipse','triangle','diamond','table'])buttons.push({...element(),dataset:{drawingTool}});
 return {root:{getElementById:get},get,buttons,dispatch,send:(type,x=100,y=100,extra={})=>dispatch(get('canvas'),type,{clientX:20+x/2,clientY:30+y/2,...extra}),choose:type=>dispatch(buttons.find(b=>b.dataset.drawingTool===type),'click'),click:id=>dispatch(get(id),'click'),rect};
}
function appHarness(){
 const original=page(),other=page(),ui=dom(),counts={},history=new History(),hit=name=>()=>counts[name]=(counts[name]||0)+1;
 const scope={note:original,notes:[original,other],drawing:null,drawingTools:null,history,activeRecognition:{noteId:original.id,controller:{abort:hit('abort')}},recognitionResults:new Map([[original.id,'result'],[other.id,'other']]),retryWarnings:new Set([original.id,other.id]),converted:new Map([[original.id,'result'],[other.id,'other']]),clearSelection:hit('clear'),autoChanged:hit('auto'),dirty(){hit('dirty')();scope.notes=scope.notes.map(n=>n.id===scope.note.id?scope.note:n)},render(){hit('render')();scope.drawingTools?.render()},stopAuto:hit('stop'),effectiveFont:()=>original.font,showEraser:hit('eraser'),$:ui.get,fetch(){throw Error('Drawing must not use a network request')},mountDrawingTools(options){scope.options=options;return mountDrawingTools({...options,root:ui.root})}};
 ui.get('width').value='3';ui.get('color').value='#223247';ui.get('pan-page').checked=true;
 vm.createContext(scope);vm.runInContext(piece('function endStroke(','function appendSamples('),scope);
 // Install the actual legacy pointer-cancel handlers before the drawing module.
 vm.runInContext(piece("for(const name of ['pointercancel','lostpointercapture'])","\n"),scope);
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
