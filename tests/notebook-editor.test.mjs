import test from 'node:test';import assert from 'node:assert/strict';
import {mountNotebookEditor} from '../src/notebook-editor.js';
import {COVER_PRESETS,applyCoverAppearance} from '../src/notebook-covers.js';
function setup(t,persist=async()=>true){const els=new Map();class El{constructor(){this.value='';this.children=[];this.attrs={};this.style={};this.open=false;}setAttribute(k,v){this.attrs[k]=v}append(...c){this.children.push(...c)}replaceChildren(...c){this.children=c}addEventListener(k,fn){this[k]=fn}focus(){this.focused=true}showModal(){assert.equal(this.open,false);this.open=true}close(){this.open=false}}const $=id=>{if(!els.has(id))els.set(id,new El());return els.get(id)};const old=globalThis.document;globalThis.document={getElementById:$,createElement:()=>new El()};t.after(()=>{globalThis.document=old});const calls=[];const api=mountNotebookEditor({persist:async data=>{calls.push(data);return persist(data)}});return {api,$,calls,submit:()=>$('notebook-form').onsubmit({preventDefault(){}})};}
test('new dialog is draft only; cancel and Escape never create notebooks',async t=>{const h=setup(t);let p=h.api.open();assert.equal(h.$('notebook-name').value,'');assert.equal(h.calls.length,0);h.$('cancel-notebook').onclick();assert.equal(await p,false);p=h.api.open();let prevented=false;h.$('notebook-dialog').cancel({preventDefault(){prevented=true}});assert.ok(prevented);assert.equal(await p,false);assert.equal(h.calls.length,0)});
test('name mandatory, whitespace rejected, cover chosen then submitted once',async t=>{const h=setup(t);const p=h.api.open();h.$('notebook-name').value='   ';await h.submit();assert.equal(h.calls.length,0);assert.equal(h.$('notebook-dialog').open,true);h.$('notebook-name').value='  나의 하루  ';h.$('cover-choice').children[3].onclick();await h.submit();assert.equal(await p,true);assert.deepEqual(h.calls,[{id:null,title:'나의 하루',cover:'clay',paperTheme:'white'}]);});
test('existing edit shows original metadata; cancel keeps caller untouched',async t=>{const book={id:'old',title:'<img onerror=x>',cover:'ivory'},h=setup(t),p=h.api.open(book);assert.equal(h.$('cover-preview-title').textContent,book.title);assert.equal(h.$('notebook-dialog-title').textContent,'이름·표지 변경');h.$('notebook-name').value='바꾸다';h.$('cancel-notebook').onclick();assert.equal(await p,false);assert.equal(book.title,'<img onerror=x>');assert.equal(h.calls.length,0)});
test('repeated open and submit share one pending draft/save; cancel blocked while saving',async t=>{let resolve;const gate=new Promise(r=>resolve=r),h=setup(t,()=>gate),p=h.api.open();assert.equal(h.api.open(),p);h.$('notebook-name').value='회의';const save=h.submit();await h.submit();h.$('cancel-notebook').onclick();assert.equal(h.calls.length,1);assert.equal(h.$('notebook-dialog').open,true);assert.equal(h.$('save-notebook').disabled,true);resolve(true);await save;assert.equal(await p,true);assert.equal(h.$('notebook-dialog').open,false)});
test('failed storage keeps draft for retry, does not falsely report success',async t=>{let ok=false;const h=setup(t,()=>ok),p=h.api.open({id:'old',title:'원본',cover:'slate'});await h.submit();assert.equal(h.$('notebook-dialog').open,true);assert.match(h.$('notebook-error').textContent,/저장하지/);assert.equal(h.$('save-notebook').disabled,false);ok=true;await h.submit();assert.equal(await p,true);assert.equal(h.calls[1].id,'old');});
test('creation includes independently selected paper theme; existing cover edit never overwrites paper',async t=>{const h=setup(t);let p=h.api.open();h.$('notebook-name').value='파란 편지';h.$('new-paper-theme').value='blue-frame';await h.submit();assert.equal(await p,true);assert.equal(h.calls[0].paperTheme,'blue-frame');p=h.api.open({id:'old',title:'기존',cover:'clay'});assert.equal(h.$('new-paper-label').hidden,true);await h.submit();assert.equal(await p,true);assert.equal(Object.hasOwn(h.calls[1],'paperTheme'),false);});

test('fifteen accessible cover swatches use the same fixed appearance as the main edit preview',async t=>{
 const h=setup(t),book={id:'old',title:'제목 <안전> & 원문',cover:'navy-block'},pending=h.api.open(book);
 assert.equal(h.$('cover-choice').children.length,15);assert.equal(h.$('cover-preview-title').textContent,book.title);
 for(const [index,preset]of COVER_PRESETS.entries()){
  h.$('cover-choice').children[index].onclick();const button=h.$('cover-choice').children[index],swatch=button.children[0],label=button.children[1];
  assert.equal(button.type,'button');assert.equal(button.attrs['aria-label'],preset.label);assert.equal(label.textContent,preset.label);assert.equal(swatch.attrs['aria-hidden'],'true');
  assert.equal(h.$('cover-choice').children.filter(b=>b.attrs['aria-pressed']==='true').length,1);assert.equal(button.attrs['aria-pressed'],'true');
  const expected={style:{},setAttribute(){}};applyCoverAppearance(expected,preset.id);
  assert.deepEqual(swatch.style,expected.style);assert.deepEqual(h.$('cover-preview').style,expected.style);assert.equal(h.$('cover-preview').attrs['aria-label'],preset.label+' 표지 미리보기');
  assert.equal(h.$('cover-preview-title').textContent,book.title);
 }
 assert.equal(h.calls.length,0);h.$('cancel-notebook').onclick();assert.equal(await pending,false);assert.equal(book.cover,'navy-block');
});
test('new design is persisted as its stable ID only, and controls remain disabled during pending save',async t=>{
 let resolve;const gate=new Promise(r=>resolve=r),h=setup(t,()=>gate),pending=h.api.open({id:'existing',title:'스페클 노트',cover:'sand-speckle'});
 const before=h.$('cover-preview').style.backgroundImage,save=h.submit();assert.ok(h.$('cover-choice').children.every(b=>b.disabled));
 h.$('cover-choice').children[0].onclick();assert.equal(h.$('cover-preview').style.backgroundImage,before);assert.deepEqual(h.calls,[{id:'existing',title:'스페클 노트',cover:'sand-speckle'}]);
 resolve(true);await save;assert.equal(await pending,true);assert.ok(h.$('cover-choice').children.every(b=>!b.disabled));
});
