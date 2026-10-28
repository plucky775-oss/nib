import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPenPicker} from '../src/pen-picker.js';
import {PEN_KINDS,strokeSvg} from '../src/pen-renderer.js';

const defer=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function harness(t,options={}){
  let settings=options.settings||{penKind:'ballpoint',width:3,color:'#223247',strokes:[{id:'old',points:[{x:10,y:20,pressure:.4}]}]};
  const elements=new Map(),htmlWrites=[],calls=[];
  class Element{
    constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.listeners={};this.open=false;this.disabled=false;this.hidden=false;this.value='';this.textContent='';this.modalCalls=0;this.closeCalls=0;}
    set innerHTML(value){this.html=value;htmlWrites.push({element:this,value});}get innerHTML(){return this.html;}
    setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
    append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
    addEventListener(name,fn){this.listeners[name]=fn;}
    showModal(){assert.equal(this.open,false);this.open=true;this.modalCalls++;}
    close(){this.open=false;this.closeCalls++;}
    click(){if(!this.disabled)return this.onclick?.();}
    escape(){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};this.listeners.cancel?.(event);if(!event.defaultPrevented)this.close();return event;}
  }
  const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  $('save-pen').textContent='이 펜으로 쓰기';
  const previous=globalThis.document;globalThis.document={getElementById:$,createElement:tag=>new Element(tag)};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const picker=mountPenPicker({getSettings:()=>settings,apply:request=>{calls.push(request);return options.apply?options.apply(request):true;}});
  return {$,picker,calls,htmlWrites,get settings(){return settings;},set settings(value){settings=value;},choices:()=>$('pen-kind-list').children,pressed:()=>$('pen-kind-list').children.filter(b=>b.getAttribute('aria-pressed')==='true')};
}
function expectedFragment(penKind,width,color){
  const points=Array.from({length:49},(_,i)=>{const t=i/48;return {x:16+208*t,y:35-16*Math.sin(2*Math.PI*t),pressure:.2+.8*Math.sin(Math.PI*t)};});
  assert.equal(points[0].pressure,.2);assert.equal(points[24].pressure,1);assert.ok(Math.abs(points.at(-1).pressure-.2)<1e-12);
  return strokeSvg({id:'pen-preview-'+penKind,penKind,width,color,points});
}

test('six accessible choices use the real pen renderer with the same sine wave and illustrative pressure',t=>{
  const h=harness(t),before=structuredClone(h.settings);assert.equal(h.picker.show(),true);assert.equal(h.choices().length,6);
  for(const [index,button]of h.choices().entries()){
    const kind=PEN_KINDS[index];assert.equal(button.type,'button');assert.equal(button.getAttribute('aria-label'),kind.label);assert.equal(button.getAttribute('data-pen-kind'),kind.id);assert.equal(button.children[1].textContent,kind.label);assert.equal(button.children[1].innerHTML,undefined);
    assert.match(button.children[0].innerHTML,/viewBox="0 0 240 70"/);assert.ok(button.children[0].innerHTML.includes(expectedFragment(kind.id,3,'#223247')));assert.equal(button.children[0].getAttribute('aria-hidden'),'true');
  }
  assert.equal(new Set(h.choices().map(b=>b.children[0].innerHTML)).size,6);assert.equal(h.pressed().length,1);assert.equal(h.pressed()[0].getAttribute('data-pen-kind'),'ballpoint');
  assert.equal(h.$('pen-width-select').value,'3');assert.equal(h.$('pen-color-input').value,'#223247');assert.deepEqual(h.settings,before);assert.equal(h.calls.length,0);
});

test('selecting kind, width and color updates draft samples only and cancel preserves all earlier ink',t=>{
  const h=harness(t),before=structuredClone(h.settings);h.$('open-pen').click();h.choices().find(b=>b.getAttribute('data-pen-kind')==='fountain').click();
  h.$('pen-width-select').value='5';h.$('pen-width-select').onchange();h.$('pen-color-input').value='#d94b59';h.$('pen-color-input').oninput();
  assert.ok(h.$('pen-sample').innerHTML.includes(expectedFragment('fountain',5,'#d94b59')));assert.equal(h.pressed().length,1);assert.equal(h.pressed()[0].getAttribute('data-pen-kind'),'fountain');
  assert.deepEqual(h.settings,before);h.$('cancel-pen').click();assert.equal(h.$('pen-dialog').open,false);assert.equal(h.calls.length,0);
});

test('all three existing width presets produce meaningful different previews without adding unsupported widths',t=>{
  const h=harness(t);h.picker.show();const samples=[];
  for(const width of [2,3,5]){h.$('pen-width-select').value=String(width);h.$('pen-width-select').onchange();samples.push(h.$('pen-sample').innerHTML);for(const [i,button]of h.choices().entries())assert.ok(button.children[0].innerHTML.includes(expectedFragment(PEN_KINDS[i].id,width,'#223247')));}
  assert.equal(new Set(samples).size,3);h.$('pen-width-select').value='10';h.$('pen-width-select').onchange();assert.equal(h.$('pen-width-select').value,'3');
});

test('kind changes do not silently replace chosen ink color, including highlighter and colored pencil',async t=>{
  const h=harness(t,{settings:{penKind:'pencil',width:2,color:'#3978d4'}});h.picker.show();
  for(const kind of ['highlighter','colored-pencil']){h.choices().find(b=>b.getAttribute('data-pen-kind')===kind).click();assert.equal(h.$('pen-color-input').value,'#3978d4');assert.ok(h.$('pen-sample').innerHTML.includes(expectedFragment(kind,2,'#3978d4')));}
  assert.equal(await h.$('save-pen').click(),true);assert.deepEqual(h.calls,[{penKind:'colored-pencil',width:2,color:'#3978d4'}]);
});

test('successful synchronous and async apply receive only settings for future strokes',async t=>{
  let result=true;const h=harness(t,{apply:()=>result}),before=structuredClone(h.settings);h.picker.show();assert.equal(await h.$('save-pen').click(),true);assert.deepEqual(h.calls[0],{penKind:'ballpoint',width:3,color:'#223247'});assert.deepEqual(h.settings,before);assert.equal(h.$('pen-dialog').open,false);
  const gate=defer();result=gate.promise;h.picker.show();const pending=h.$('save-pen').click();assert.equal(h.$('pen-dialog').open,true);gate.resolve(true);assert.equal(await pending,true);assert.equal(h.$('pen-dialog').open,false);assert.deepEqual(h.settings,before);
});

test('reopening prepopulates the latest settings while repeated show preserves an unsaved draft',t=>{
  const h=harness(t);h.picker.show();h.choices()[0].click();assert.equal(h.picker.show(),false);assert.equal(h.$('pen-dialog').modalCalls,1);assert.equal(h.pressed()[0].getAttribute('data-pen-kind'),'pencil');
  h.$('cancel-pen').click();h.settings={penKind:'marker',width:5,color:'#AB12CD'};h.picker.show();assert.equal(h.pressed()[0].getAttribute('data-pen-kind'),'marker');assert.equal(h.$('pen-width-select').value,'5');assert.equal(h.$('pen-color-input').value,'#ab12cd');
});

test('malformed settings and injected colors never become HTML, labels or arbitrary SVG attributes',async t=>{
  const h=harness(t,{settings:{penKind:'<img src=x>',width:'bad',color:'red" onload="evil'}});h.picker.show();
  assert.equal(h.pressed()[0].getAttribute('data-pen-kind'),'ballpoint');assert.equal(h.$('pen-width-select').value,'3');assert.equal(h.$('pen-color-input').value,'#223247');
  h.$('pen-color-input').value='<script>';h.$('pen-color-input').onchange();assert.equal(h.$('pen-color-input').value,'#223247');
  assert.ok(h.htmlWrites.every(({element,value})=>(element.className==='pen-kind-swatch'||element===h.$('pen-sample'))&&!value.includes('onload')&&!value.includes('<script')&&!value.includes('<img')));
  await h.$('save-pen').click();assert.deepEqual(h.calls[0],{penKind:'ballpoint',width:3,color:'#223247'});
});

test('pending apply blocks duplicate saving, draft changes, reopening, cancel and native Escape',async t=>{
  const gate=defer(),h=harness(t,{apply:()=>gate.promise});h.picker.show();const pending=h.$('save-pen').click();
  for(const id of ['save-pen','cancel-pen','open-pen','pen-width-select','pen-color-input'])assert.equal(h.$(id).disabled,true,id);
  assert.ok(h.choices().every(b=>b.disabled));assert.equal(await h.$('save-pen').onclick(),false);assert.equal(h.choices()[0].onclick(),false);assert.equal(h.$('pen-width-select').onchange(),false);assert.equal(h.$('pen-color-input').oninput(),false);assert.equal(h.$('cancel-pen').onclick(),false);assert.equal(h.picker.show(),false);
  assert.equal(h.$('pen-dialog').escape().defaultPrevented,true);assert.equal(h.calls.length,1);assert.equal(h.$('pen-dialog').getAttribute('aria-busy'),'true');
  gate.resolve(true);await pending;assert.equal(h.$('pen-dialog').open,false);assert.equal(h.$('pen-dialog').getAttribute('aria-busy'),'false');assert.ok(h.choices().every(b=>!b.disabled));assert.equal(h.$('save-pen').textContent,'이 펜으로 쓰기');
});

test('false apply keeps draft and visible error for retry; thrown errors use safe DOM text',async t=>{
  let result=false;const h=harness(t,{apply:()=>{if(result==='throw')throw Error('<unsafe> 실패');return result;}});h.picker.show();h.choices()[0].click();
  assert.equal(await h.$('save-pen').click(),false);assert.equal(h.$('pen-dialog').open,true);assert.match(h.$('pen-error').textContent,/적용하지 못/);assert.equal(h.pressed()[0].getAttribute('data-pen-kind'),'pencil');
  result='throw';assert.equal(await h.$('save-pen').click(),false);assert.equal(h.$('pen-error').textContent,'<unsafe> 실패');assert.equal(h.$('pen-error').innerHTML,undefined);assert.equal(h.$('save-pen').disabled,false);
  result=true;assert.equal(await h.$('save-pen').click(),true);assert.equal(h.calls.length,3);assert.equal(h.$('pen-dialog').open,false);
});

test('idle Escape and closed-dialog save cannot apply or change saved settings',async t=>{
  const h=harness(t),before=structuredClone(h.settings);assert.equal(await h.$('save-pen').onclick(),false);h.picker.show();h.choices()[0].click();
  assert.equal(h.$('pen-dialog').escape().defaultPrevented,false);assert.equal(h.$('pen-dialog').open,false);assert.equal(h.calls.length,0);assert.deepEqual(h.settings,before);
  h.picker.show();assert.equal(h.pressed()[0].getAttribute('data-pen-kind'),'ballpoint');assert.equal(h.$('pen-error').hidden,true);
});
