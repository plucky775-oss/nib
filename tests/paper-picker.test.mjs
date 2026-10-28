import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPaperPicker} from '../src/paper-picker.js';
import {PAPER_THEMES,normalizePaperTheme,paperBackgroundSvg} from '../src/paper-themes.js';

const defer=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function harness(t,options={}){
  let note=options.note||{id:'page',paper:'grid',paperTheme:PAPER_THEMES[2].id,text:'<private note>',strokes:[]};
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
  $('save-paper').textContent='종이 적용';
  const previous=globalThis.document;globalThis.document={getElementById:$,createElement:tag=>new Element(tag)};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const picker=mountPaperPicker({getNote:()=>note,apply:async request=>{calls.push(request);return options.apply?await options.apply(request):true;}});
  return {$,picker,calls,htmlWrites,get note(){return note;},set note(value){note=value;},choices:()=>$('paper-theme-list').children,pressed:()=>$('paper-theme-list').children.filter(b=>b.getAttribute('aria-pressed')==='true')};
}

test('opens current draft with 13 accessible family/label choices and plain local SVG swatches',t=>{
  const h=harness(t),before=structuredClone(h.note);assert.equal(h.picker.show(),true);
  assert.equal(h.$('paper-dialog').open,true);assert.equal(h.choices().length,13);assert.equal(h.choices().length,PAPER_THEMES.length);
  assert.equal(h.pressed().length,1);assert.equal(h.pressed()[0].getAttribute('data-paper-theme'),h.note.paperTheme);assert.equal(h.$('paper-scope').value,'current');
  for(const [i,button]of h.choices().entries()){
    const theme=PAPER_THEMES[i];assert.equal(button.type,'button');assert.equal(button.getAttribute('aria-label'),theme.family+' · '+theme.label);
    assert.equal(button.getAttribute('data-paper-family'),theme.family);assert.equal(button.children[1].textContent,theme.label);assert.equal(button.children[2].textContent,theme.family);
    assert.equal(button.children[0].innerHTML,paperBackgroundSvg({paper:'plain',paperTheme:theme.id}));assert.equal(button.children[0].getAttribute('aria-hidden'),'true');
  }
  assert.equal(h.$('paper-sample').innerHTML,paperBackgroundSvg({paper:'grid',paperTheme:h.note.paperTheme}));assert.deepEqual(h.note,before);assert.equal(h.calls.length,0);
  assert.ok(h.htmlWrites.every(({element})=>element.className==='paper-theme-swatch'||element===h.$('paper-sample')));assert.ok(h.htmlWrites.every(({value})=>!value.includes('private note')));
});

test('choosing a theme updates only draft preview and aria state; cancel never applies',t=>{
  const h=harness(t),before=structuredClone(h.note);h.$('open-paper').click();const selected=PAPER_THEMES.at(-1);
  h.choices().at(-1).click();assert.equal(h.pressed().length,1);assert.equal(h.pressed()[0].getAttribute('data-paper-theme'),selected.id);
  assert.equal(h.$('paper-sample').innerHTML,paperBackgroundSvg({paper:h.note.paper,paperTheme:selected.id}));assert.deepEqual(h.note,before);
  assert.equal(h.$('cancel-paper').click(),true);assert.equal(h.$('paper-dialog').open,false);assert.equal(h.calls.length,0);
});

test('reopening reloads current note, resets scope and error, and invalid themes safely fall back',t=>{
  const h=harness(t,{note:{paper:'plain',paperTheme:'<script>bad</script>'}});h.picker.show();assert.equal(h.pressed()[0].getAttribute('data-paper-theme'),normalizePaperTheme(undefined));
  h.choices()[3].click();h.$('paper-scope').value='notebook';h.$('cancel-paper').click();h.note={paper:'ruled',paperTheme:PAPER_THEMES[6].id};
  h.picker.show();assert.equal(h.pressed()[0].getAttribute('data-paper-theme'),PAPER_THEMES[6].id);assert.equal(h.$('paper-scope').value,'current');assert.equal(h.$('paper-error').textContent,'');assert.equal(h.$('paper-error').hidden,true);
  assert.equal(h.$('paper-sample').innerHTML,paperBackgroundSvg(h.note));
});

test('repeated show while open preserves in-progress selection and never double opens dialog',t=>{
  const h=harness(t);h.picker.show();h.choices()[4].click();h.$('paper-scope').value='notebook';
  assert.equal(h.picker.show(),false);assert.equal(h.$('open-paper').onclick(),false);assert.equal(h.$('paper-dialog').modalCalls,1);
  assert.equal(h.pressed()[0].getAttribute('data-paper-theme'),PAPER_THEMES[4].id);assert.equal(h.$('paper-scope').value,'notebook');assert.equal(h.calls.length,0);
});

test('apply receives exactly the selected theme and current/notebook scope and true closes',async t=>{
  const h=harness(t);h.picker.show();h.choices()[5].click();assert.equal(await h.$('save-paper').click(),true);
  assert.deepEqual(h.calls,[{paperTheme:PAPER_THEMES[5].id,scope:'current'}]);assert.equal(h.$('paper-dialog').open,false);
  h.picker.show();h.choices()[7].click();h.$('paper-scope').value='notebook';await h.$('save-paper').click();
  assert.deepEqual(h.calls[1],{paperTheme:PAPER_THEMES[7].id,scope:'notebook'});assert.equal(h.$('paper-dialog').open,false);assert.equal(h.$('save-paper').textContent,'종이 적용');
});

test('invalid scope cannot expand the operation beyond current page',async t=>{
  const h=harness(t);h.picker.show();h.$('paper-scope').value='all-notebooks';await h.$('save-paper').click();assert.equal(h.calls[0].scope,'current');
});

test('pending apply disables every action and blocks repeat save, cancel, Escape and programmatic show',async t=>{
  const gate=defer(),h=harness(t,{apply:()=>gate.promise});h.picker.show();h.choices()[8].click();h.$('paper-scope').value='notebook';const pending=h.$('save-paper').click();
  for(const id of ['save-paper','cancel-paper','paper-scope','open-paper'])assert.equal(h.$(id).disabled,true,id);
  assert.ok(h.choices().every(button=>button.disabled));assert.equal(h.$('paper-dialog').getAttribute('aria-busy'),'true');
  assert.equal(await h.$('save-paper').onclick(),false);assert.equal(h.$('cancel-paper').onclick(),false);assert.equal(h.choices()[1].onclick(),false);assert.equal(h.picker.show(),false);
  assert.equal(h.$('paper-dialog').escape().defaultPrevented,true);assert.equal(h.$('paper-dialog').open,true);assert.equal(h.calls.length,1);
  gate.resolve(true);assert.equal(await pending,true);assert.deepEqual(h.calls[0],{paperTheme:PAPER_THEMES[8].id,scope:'notebook'});
  for(const id of ['save-paper','cancel-paper','paper-scope','open-paper'])assert.equal(h.$(id).disabled,false,id);
  assert.ok(h.choices().every(button=>!button.disabled));assert.equal(h.$('paper-dialog').getAttribute('aria-busy'),'false');assert.equal(h.$('paper-dialog').open,false);
});

test('false apply leaves dialog and draft intact, shows an error, and permits retry',async t=>{
  let result=false;const h=harness(t,{apply:async()=>result}),before=structuredClone(h.note);h.picker.show();h.choices()[9].click();
  assert.equal(await h.$('save-paper').click(),false);assert.equal(h.$('paper-dialog').open,true);assert.equal(h.$('paper-error').hidden,false);assert.match(h.$('paper-error').textContent,/저장하지 못/);
  assert.equal(h.pressed()[0].getAttribute('data-paper-theme'),PAPER_THEMES[9].id);assert.deepEqual(h.note,before);assert.equal(h.$('save-paper').disabled,false);
  result=true;assert.equal(await h.$('save-paper').click(),true);assert.equal(h.calls.length,2);assert.equal(h.$('paper-dialog').open,false);
});

test('thrown apply errors render as safe text and release busy state without applying a different theme',async t=>{
  const message='<img src=x onerror=alert(1)> 저장 실패',h=harness(t,{apply:async()=>{throw Error(message);}});h.picker.show();
  assert.equal(await h.$('save-paper').click(),false);assert.equal(h.$('paper-error').textContent,message);assert.equal(h.$('paper-error').innerHTML,undefined);assert.equal(h.$('paper-dialog').open,true);assert.equal(h.$('cancel-paper').disabled,false);
  h.choices()[1].click();assert.equal(h.$('paper-error').hidden,true);assert.equal(h.$('paper-error').textContent,'');h.$('cancel-paper').click();assert.equal(h.calls.length,1);
});

test('native Escape discards draft without apply when idle and reopening reflects saved note',t=>{
  const h=harness(t);h.picker.show();h.choices()[10].click();assert.equal(h.$('paper-dialog').escape().defaultPrevented,false);assert.equal(h.$('paper-dialog').open,false);assert.equal(h.calls.length,0);
  h.picker.show();assert.equal(h.pressed()[0].getAttribute('data-paper-theme'),h.note.paperTheme);assert.equal(h.$('paper-dialog').modalCalls,2);
});

test('closed dialog cannot apply and only explicit true is considered successful',async t=>{
  const h=harness(t,{apply:async()=>undefined});assert.equal(await h.$('save-paper').onclick(),false);assert.equal(h.calls.length,0);
  h.picker.show();assert.equal(await h.$('save-paper').click(),false);assert.equal(h.$('paper-dialog').open,true);assert.equal(h.$('paper-error').hidden,false);
});
