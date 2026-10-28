import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {hitTestText} from '../src/text-hit.js';
import {fitGroupText,activeConvertedGroups} from '../src/converted-groups.js';

const source=readFileSync('src/app.js','utf8'),plain=value=>JSON.parse(JSON.stringify(value));
const object=(id='event',overrides={})=>({kind:'text-object',id,text:'첫 줄\n\n마지막 줄',font:'Gaegu',fontSize:24,strokeIds:['missing-source'],bounds:{x:100,y:100,width:400,height:180},...overrides});
function harness(groups=[object()]){
  const nodes=new Map();
  const element=tag=>({tag,attrs:{},children:[],hidden:false,setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},toggleAttribute(k,v){this.attrs[k]=v;}});
  const $=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
  const metrics={font:'24px Gaegu',measureText(text){return {width:Array.from(text).length*Number.parseFloat(this.font)*.56};}};
  const scope={renderedTextTargets:[],drawing:null,NS:'svg',$,document:{createElementNS:(_ns,tag)=>element(tag)},metrics,layoutCache:new Map(),fitGroupText,activeConvertedGroups,
    note:{id:'page',font:'PoorStory',fontSize:40,mode:'text',showOriginal:false,strokes:[],convertedGroups:groups,text:groups.map(g=>g.text).join('\n')},tool:'pen',
    drawSelection(){},buttons(){},groupFont:g=>g.font||scope.note.font,path(){throw Error('No raw ink expected');}};
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function visibleGroups('),source.indexOf('let metrics;')),scope);
  vm.runInContext(source.slice(source.indexOf('function groupLayout('),source.indexOf('function list(')),scope);
  return {scope,$,groups,render(){scope.renderInk();return $('converted-ink').children;}};
}

test('actual renderer emits one wrapper, durable object ID and whole-object hit surface for every conversion',()=>{
  const h=harness(),nodes=h.render(),wrappers=nodes.filter(n=>n.tag==='g');
  assert.equal(wrappers.length,1);const wrapper=wrappers[0];
  assert.equal(wrapper.attrs['data-text-object-id'],'event');assert.match(wrapper.attrs['clip-path'],/^url\(#nib-group-clip-/);
  const surfaces=wrapper.children.filter(n=>n.attrs['data-object-hit-surface']==='true');assert.equal(surfaces.length,1);
  const surface=surfaces[0];assert.equal(surface.tag,'rect');assert.equal(surface.attrs.fill,'transparent');
  for(const [key,value]of Object.entries(h.groups[0].bounds))assert.equal(surface.attrs[key],value);
  const text=wrapper.children.filter(n=>n.tag==='text');assert.equal(text.length,3);
  assert.deepEqual(text.map(n=>n.textContent),['첫 줄','','마지막 줄']);
  assert.ok(text.every(n=>n.attrs['font-family']==='Gaegu, sans-serif'));
  assert.equal(h.scope.textTargets().length,1);assert.deepEqual(plain(h.scope.textTargets()[0]),{groupId:'event',strokeIds:['missing-source'],bounds:h.groups[0].bounds});
});

test('paragraph whitespace and blank lines hit the same whole conversion, not separate glyph or row targets',()=>{
  const h=harness();h.render();const targets=h.scope.textTargets();
  for(const point of [{x:100,y:100},{x:490,y:140},{x:300,y:190},{x:500,y:280}])assert.equal(hitTestText(point,targets)?.groupId,'event');
  for(const point of [{x:99,y:180},{x:501,y:180},{x:300,y:281}])assert.equal(hitTestText(point,targets),null);
});

test('hit geometry comes from stored object bounds even without any original strokes or glyph BBox API',()=>{
  const h=harness([object('source-less',{strokeIds:[]})]);h.render();
  for(const node of h.$('converted-ink').children)node.getBBox=()=>{throw Error('Glyph metrics are not object geometry');};
  assert.equal(hitTestText({x:400,y:250},h.scope.textTargets())?.groupId,'source-less');
  const first=h.scope.textTargets();first[0].bounds.x=999;
  assert.equal(h.scope.textTargets()[0].bounds.x,100);assert.equal(h.groups[0].bounds.x,100);
});

test('moving or restyling a full object refreshes one target while unrelated historical pieces stay independent',()=>{
  const a=object('old_row_1',{text:'old first\n'}),b=object('old_row_2',{text:'old second',font:'PoorStory',bounds:{x:550,y:500,width:200,height:100}}),h=harness([a,b]);
  h.render();assert.equal(h.scope.textTargets().length,2);
  h.scope.note.convertedGroups=[{...a,font:'NanumBrushScript',bounds:{...a.bounds,x:130,y:140}},b];h.render();
  const targets=h.scope.textTargets();assert.equal(targets.length,2);assert.deepEqual(plain(targets[0].bounds),{...a.bounds,x:130,y:140});assert.deepEqual(plain(targets[1].bounds),b.bounds);
  assert.equal(h.$('converted-ink').children.filter(n=>n.tag==='g').length,2);assert.equal(b.text,'old second');
});

test('overlapping objects retain separate wrappers and topmost event wins the hit',()=>{
  const h=harness([object('lower'),object('upper',{text:'다른 변환\n전체',strokeIds:[]})]);h.render();
  assert.deepEqual(plain(h.scope.textTargets().map(t=>t.groupId)),['lower','upper']);
  assert.equal(hitTestText({x:250,y:210},h.scope.textTargets())?.groupId,'upper');
  assert.deepEqual(h.$('converted-ink').children.filter(n=>n.tag==='g').map(n=>n.attrs['data-text-object-id']),['lower','upper']);
});

test('direct drag outline covers the whole object, follows its clamped delta and clears on completion',()=>{
  const h=harness(),bounds={x:100,y:100,width:400,height:180};
  h.scope.drawing={directTouch:true,hitBounds:[bounds],dx:30,dy:40};h.scope.drawDirectOutline();
  const host=h.$('text-drag-outline');assert.equal(host.children.length,1);assert.deepEqual(host.children[0].attrs,{...bounds,x:130,y:140});
  h.scope.drawing=null;h.scope.drawDirectOutline();assert.equal(host.children.length,0);
});

test('original-ink mode and eraser remove invisible object targets rather than leaving stale drag surfaces',()=>{
  const h=harness();h.render();assert.equal(h.scope.textTargets().length,1);
  h.scope.note.showOriginal=true;h.render();assert.equal(h.scope.textTargets().length,0);assert.equal(h.$('converted-ink').children.length,0);
  h.scope.note.showOriginal=false;h.scope.tool='eraser';h.render();assert.equal(h.scope.textTargets().length,0);
  h.scope.tool='pen';h.render();assert.equal(h.scope.textTargets().length,1);
});
