import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fitGroupText,activeConvertedGroups} from '../src/converted-groups.js';
import {FONTS} from '../src/core.js';
import {customFontId} from '../src/custom-fonts.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function piece(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`Missing app extraction: ${start}`);return source.slice(a,b);}
// Exact v30 (9efcab16) groupLayout snapshot. Kept inline so this regression does
// not depend on a sibling checkout. Both versions execute the real fitGroupText.
const oldLayout='function groupLayout(group){const key=JSON.stringify([note.id,group.id,group.text,group.bounds,groupFont(group),group.fontSize||note.fontSize]);if(layoutCache.has(key))return layoutCache.get(key);metrics??=document.createElement("canvas").getContext("2d");const preview=group.text.length>3000?group.text.slice(0,3000)+"…":group.text;const row={text:preview,bounds:group.bounds,...fitGroupText(preview,group.bounds,group.fontSize||note.fontSize,{measure:(text,size)=>{metrics.font=`${size}px ${groupFont(group)}, sans-serif`;return metrics.measureText(text).width}})};const result={rows:[row],overflow:row.overflow||preview!==group.text,ambiguous:false};layoutCache.set(key,result);if(layoutCache.size>256)layoutCache.delete(layoutCache.keys().next().value);return result;}';
const object=(overrides={})=>({kind:'text-object',id:'object-one',strokeIds:['absent-source'],text:'첫 줄과 긴 문장\n\nlast line 😀',font:'Gaegu',fontSize:24,bounds:{x:80,y:150,width:260,height:180},...overrides});
function harness({legacy=false,groups=[object()]}={}){
 const nodes=new Map(),events=new Map(),faces=new Map(),counts={measure:0,fit:0,render:0,canvas:0},deleted=[],toasts=[];
 const element=tag=>({tag,attrs:{},children:[],style:{},dataset:{},value:'',hidden:false,classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},toggleAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},focus(){},click(){}});
 const $=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
 const metrics={font:'',factor:1,measureText(text){counts.measure++;const size=Number.parseFloat(this.font),index=FONTS.findIndex(f=>this.font.includes(f.id));return {width:Array.from(text).reduce((n,c)=>n+(c===' '?.3:/[\x00-\x7f]/.test(c)?.5:.9),0)*size*(1+Math.max(index,0)*.03)*this.factor};}};
 const scope={$,...{FONTS,customFontId},NS:'svg',note:{id:'page-one',font:'PoorStory',fontSize:32,strokes:[],convertedGroups:groups,text:'',mode:'text',showOriginal:false},tool:'pen',drawing:null,drawingTools:null,
  customFonts:[],customFaces:faces,fontBusy:false,metrics:undefined,layoutCache:new Map(),activeConvertedGroups,
  fitGroupText(...args){counts.fit++;return fitGroupText(...args);},
  document:{createElement:tag=>{if(tag==='canvas'){counts.canvas++;return {getContext:()=>metrics};}return element(tag);},createElementNS:(_ns,tag)=>element(tag),fonts:{addEventListener(name,fn){events.set(name,fn);},delete(face){deleted.push(face);}}},
  drawSelection(){},buttons(){},path(){throw Error('Fixture contains no visible raw strokes');},chooseDefaultFont(){},confirm:()=>true,toast:text=>toasts.push(text),
  render(){counts.render++;},deleteCustomFont:async()=>{},makeFontRecord:async file=>file.record,loadCustomFace:async record=>({family:record.id}),storeCustomFont:async()=>{},listCustomFonts:async()=>[]};
 vm.createContext(scope);
 vm.runInContext(piece('function resolvedFont(','function freezeGroupFonts(')+piece('function visibleGroups(','let metrics;')+(legacy?oldLayout:piece('function groupLayout(','function selectionGroups('))+piece('function renderInk(','function list('),scope);
 const actualRender=scope.renderInk;
 return {scope,$,metrics,counts,faces,events,deleted,toasts,groups,layout:g=>scope.groupLayout(g),reset(){counts.measure=counts.fit=0;},render(){actualRender();return $('converted-ink').children;},fontHandlers(){vm.runInContext(piece('function renderFontOptions(','async function deleteNotebook('),scope);},fontEvents(){const line=source.split('\n').find(x=>x.includes("for(const event of ['loadingdone','loadingerror'])"));assert.ok(line,'Actual font lifecycle listeners must exist');vm.runInContext(line,scope);}};
}

for(const [name,fixture]of [
 ['multiline and blank lines',object()],
 ['tight overflow',object({text:'매우 긴 문장 ABC 😀 '.repeat(8),bounds:{x:860,y:1170,width:40,height:30}})],
 ['fractional geometry',object({text:'가 a\n😀 é\n끝',bounds:{x:10.25,y:19.75,width:170.5,height:100.25}})],
 ['preview truncation',object({text:'a'.repeat(3001),bounds:{x:0,y:0,width:900,height:1200}})],
 ['full page legacy defaults',object({font:undefined,fontSize:undefined,text:'legacy default\n원본',bounds:{x:0,y:0,width:900,height:1200}})]
])test(`actual layout is exactly equivalent to v30 for ${name}`,()=>{
 for(const font of FONTS)for(const fontSize of [24,32,40]){
  const group={...fixture,...(fixture.font?{font:font.id,fontSize}:{})},old=harness({legacy:true}),next=harness();
  assert.deepEqual(plain(next.layout(group)),plain(old.layout(group)),`${name}: ${font.id}/${fontSize}`);
  assert.ok(next.counts.measure>0,'Real fit must measure: missing x/y must not trigger invalid-bounds fallback');
 }
});

test('translation-only drag reuses typography with zero measurements and zero fits after warmup',()=>{
 const group=object(),h=harness(),old=harness({legacy:true});h.layout(group);old.layout(group);h.reset();old.reset();
 for(let i=1;i<=100;i++){const moved={...group,bounds:{...group.bounds,x:80+i,y:150+i}};assert.deepEqual(plain(h.layout(moved)),plain(old.layout(moved)));}
 assert.equal(h.counts.measure,0);assert.equal(h.counts.fit,0);assert.equal(h.scope.layoutCache.size,1);assert.ok(old.counts.measure>0,'Regression would fail against the old position-keyed cache');assert.equal(h.counts.canvas,1);
});

test('returned bounds are fresh snapshots, not cache or mutable note references',()=>{
 const group=object(),h=harness(),first=h.layout(group),snapshot=plain(first);group.bounds.x+=20;group.bounds.y+=40;const second=h.layout(group);
 assert.deepEqual(plain(first),snapshot);assert.notEqual(first.rows[0].bounds,group.bounds);assert.notEqual(first.rows[0].bounds,second.rows[0].bounds);
 second.rows[0].bounds.x=999;assert.equal(h.layout(group).rows[0].bounds.x,100);assert.equal(group.bounds.x,100);
});

for(const [field,change]of [
 ['width',g=>({...g,bounds:{...g.bounds,width:170}})],['height',g=>({...g,bounds:{...g.bounds,height:65}})],
 ['text',g=>({...g,text:g.text+' 새 문장'})],['font',g=>({...g,font:'NanumBrushScript'})],['font size',g=>({...g,fontSize:40})]
])test(`${field} changes invalidate typography and preserve baseline results`,()=>{
 const group=object(),h=harness();h.layout(group);h.reset();const changed=change(group);
 assert.deepEqual(plain(h.layout(changed)),plain(harness({legacy:true}).layout(changed)));assert.ok(h.counts.measure>0);assert.equal(h.counts.fit,1);h.reset();h.layout(changed);assert.equal(h.counts.measure,0);
});

test('legacy inherited defaults invalidate, but explicit object overrides remain independent',()=>{
 const inherited=object({font:undefined,fontSize:undefined}),fixed=object({id:'fixed'}),h=harness();h.layout(inherited);h.layout(fixed);h.reset();
 h.scope.note.font='GamjaFlower';h.scope.note.fontSize=40;h.layout(inherited);assert.equal(h.counts.fit,1);assert.ok(h.counts.measure>0);h.reset();h.layout(fixed);assert.equal(h.counts.fit,0);assert.equal(h.counts.measure,0);
});

test('cache stays bounded at 256 entries and safely recomputes evicted typography',()=>{
 const h=harness(),first=object();h.layout(first);for(let i=0;i<256;i++)h.layout(object({id:'other-'+i}));assert.equal(h.scope.layoutCache.size,256);h.reset();h.layout(first);assert.equal(h.counts.fit,1);assert.equal(h.scope.layoutCache.size,256);
});

function nodeSnapshot(node){return {tag:node.tag,attrs:node.attrs,text:node.textContent,children:node.children.map(nodeSnapshot)};}
test('actual renderInk moves glyphs, clip and whole-object hit surface without remeasuring or moving another object',()=>{
 const a=object(),b=object({id:'second',text:'unchanged',font:'PoorStory',bounds:{x:500,y:700,width:300,height:100}}),h=harness({groups:[a,b]});
 const before=h.render().map(nodeSnapshot),layout=plain(h.layout(a)),noteBefore=plain(h.scope.note);h.reset();h.scope.note.convertedGroups=[{...a,bounds:{...a.bounds,x:110,y:205}},b];
 const after=h.render(),old=harness({legacy:true,groups:h.scope.note.convertedGroups});assert.deepEqual(after.map(nodeSnapshot),old.render().map(nodeSnapshot));assert.equal(h.counts.measure,0);assert.equal(h.counts.fit,0);
 assert.deepEqual(after.slice(2).map(nodeSnapshot),before.slice(2));const clip=after[0].children[0],wrapper=after[1],surface=wrapper.children[0],texts=wrapper.children.slice(1);
 assert.deepEqual(clip.attrs,{x:110,y:205,width:260,height:180});for(const [k,v]of Object.entries(clip.attrs))assert.equal(surface.attrs[k],v);
 texts.forEach((node,i)=>{assert.equal(node.attrs.x,110);assert.equal(node.attrs.y,205+layout.rows[0].fontSize*.9+i*layout.rows[0].lineHeight);assert.equal(node.attrs['font-size'],layout.rows[0].fontSize);assert.equal(node.attrs['font-family'],'Gaegu, sans-serif');});
 assert.deepEqual(plain(h.scope.textTargets()[0].bounds),clip.attrs);assert.deepEqual(plain(a),noteBefore.convertedGroups[0]);assert.deepEqual(h.scope.note.strokes,noteBefore.strokes);
});

for(const event of ['loadingdone','loadingerror'])test(`${event} clears stale metrics and rerenders through the actual registered callback`,()=>{
 const group=object({text:'a mixed 한글 sentence '.repeat(10)}),h=harness({groups:[group]});const before=plain(h.layout(group));h.fontEvents();h.metrics.factor=1.7;h.reset();h.events.get(event)();
 assert.ok(h.counts.measure>0);assert.equal(h.counts.fit,1);const after=plain(h.layout(group)),fresh=harness();fresh.metrics.factor=1.7;assert.deepEqual(after,plain(fresh.layout(group)));assert.notDeepEqual(after,before);
});

test('font lifecycle notifications before a note exists clear cache without trying to render',()=>{
 const h=harness();h.layout(object());h.fontEvents();h.scope.note=undefined;h.scope.renderInk=()=>assert.fail('No current note');h.events.get('loadingdone')();h.events.get('loadingerror')();assert.equal(h.scope.layoutCache.size,0);
});

const customId='custom_'+'a'.repeat(64),record={id:customId,name:'로컬 글씨',fileName:'local.woff2'};
test('actual custom-font delete and same-ID re-add clear cached face metrics, retain durable references and fallback safely',async()=>{
 const group=object({font:customId}),h=harness({groups:[group]}),originalFace={family:customId};h.scope.customFonts=[record];h.faces.set(customId,originalFace);h.fontHandlers();h.scope.renderFontOptions();const originalNote=plain(h.scope.note);h.layout(group);
 const customCard=h.$('font-options').children.find(card=>card.children[0].dataset.font===customId),remove=customCard.children.find(child=>child.className==='font-delete');assert.ok(remove);await remove.onclick();
 assert.deepEqual(h.deleted,[originalFace]);assert.equal(h.faces.has(customId),false);assert.equal(h.scope.layoutCache.size,0);assert.deepEqual(plain(h.scope.note),originalNote);assert.equal(h.scope.groupFont(group),FONTS[0].id);
 h.layout(group);h.reset();h.metrics.factor=1.6;await h.$('font-file').onchange({target:{files:[{record}],value:'chosen-file'}});
 assert.equal(h.scope.layoutCache.size,0);assert.equal(h.faces.has(customId),true);assert.equal(h.scope.groupFont(group),customId);assert.deepEqual(plain(h.scope.note),originalNote);h.layout(group);assert.equal(h.counts.fit,1);assert.ok(h.counts.measure>0);assert.equal(h.$('add-font').disabled,false);
});

test('actual font restoration invalidates same-ID metrics after faces finish loading',async()=>{
 const group=object({font:customId}),h=harness();h.faces.set(customId,{old:true});h.layout(group);h.fontHandlers();h.scope.listCustomFonts=async()=>[record];h.metrics.factor=1.4;await h.scope.restoreFonts();
 assert.equal(h.scope.layoutCache.size,0);assert.deepEqual(h.faces.get(customId),{family:customId});h.reset();h.layout(group);assert.equal(h.counts.fit,1);assert.ok(h.counts.measure>0);
});
