import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeConvertedGroup,validateGroups,appendTextObject,activeConvertedGroups,groupFontOverrides} from '../src/converted-groups.js';
import {FONTS,makeNote,validateNote,parseBackup} from '../src/core.js';
const strokes=[{id:'stroke-one',width:3,color:'#223247',points:[{x:90,y:200},{x:250,y:230}]}];
const make=(options={})=>makeConvertedGroup(strokes,'원문\n여러 줄 유지',{id:'group-one',...options});

test('built-in font allowlist applies to the entire multiline object and survives missing-ink validation',()=>{
  for(const f of FONTS)for(const fontSize of [24,32,40]){
    const g=make({font:f.id,fontSize});assert.equal(g.font,f.id);assert.equal(g.fontSize,fontSize);
    assert.deepEqual(validateGroups([g],[]),[g]);assert.equal(g.text,'원문\n여러 줄 유지');
  }
});

test('custom font identity is preserved without requiring that font file or source ink on this device',()=>{
  const font='custom_'+'a'.repeat(64),g=make({font,fontSize:32});assert.equal(g.font,font);assert.deepEqual(validateGroups([g],[]),[g]);
});

test('legacy groups freeze note-level font during validation without splitting or merging historical pieces',()=>{
  const a=make({id:'old_row_1'}),b=make({id:'old_row_2'});for(const g of [a,b]){delete g.font;delete g.fontSize;delete g.kind;}
  const n=validateNote({...makeNote(),font:'Gaegu',fontSize:40,strokes:[],convertedGroups:[a,b]});
  assert.equal(n.convertedGroups.length,2);assert.deepEqual(n.convertedGroups.map(g=>g.id),['old_row_1','old_row_2']);
  for(const g of n.convertedGroups){assert.equal(g.font,'Gaegu');assert.equal(g.fontSize,40);assert.equal(g.text,a.text);}
  n.font='PoorStory';n.fontSize=24;assert.equal(n.convertedGroups[0].font,'Gaegu');assert.equal(n.convertedGroups[1].fontSize,40);
});

test('unsafe font values and invalid sizes are sanitized without losing any multiline content',()=>{
  for(const font of ['serif','Gaegu,serif','url(https://example.test/font)','custom_'+'a'.repeat(64)+'\n','custom_'+'a'.repeat(63),'<style>',{},null]){
    const g=make({font:'Gaegu'});g.font=font;g.fontSize='40';const normalized=validateGroups([g],[]);
    assert.equal(normalized.length,1);assert.equal(normalized[0].text,g.text);assert.ok(!Object.hasOwn(normalized[0],'font'));assert.ok(!Object.hasOwn(normalized[0],'fontSize'));
  }
  for(const fontSize of [NaN,Infinity,-1,0,8,200,33,'32',null])assert.equal(make({fontSize}).fontSize,32);
});

test('JSON backup restores independent full-object fonts, own positions and optional original stroke data',()=>{
  const second=[{...strokes[0],id:'stroke-two',points:[{x:90,y:300},{x:220,y:330}]}];
  const g1=make({font:'Gaegu',fontSize:24}),g2=makeConvertedGroup(second,'다른 영역\n둘째 객체',{id:'group-two',font:'PoorStory',fontSize:40});
  for(const raw of [[...strokes,...second],[]]){
    const n={...makeNote(),font:'NanumPenScript',fontSize:32,strokes:raw,convertedGroups:[g1,g2]},restored=parseBackup(JSON.stringify({version:1,notes:[n]}))[0];
    assert.deepEqual(restored.convertedGroups,[g1,g2]);assert.deepEqual(restored.strokes,raw);assert.equal(restored.font,'NanumPenScript');
  }
});

test('append preserves prior full text and independent font even when conversion events share provenance',()=>{
  const original=make({font:'Gaegu'}),later=make({id:'later-event',font:'PoorStory',fontSize:40});later.text='새 인식\n전체 결과';
  const appended=appendTextObject([original],later);
  assert.deepEqual(appended.map(g=>g.id),['group-one','later-event']);assert.equal(appended[0].font,'Gaegu');assert.equal(appended[1].font,'PoorStory');
  assert.equal(appended[0].text,original.text);assert.equal(appended[1].text,later.text);assert.equal(activeConvertedGroups(appended,[]).length,2);
});

test('changing the app default font does not restyle any existing multiline conversion',()=>{
  const original=make({font:'Gaegu',fontSize:24}),legacy=make({id:'legacy'});delete legacy.font;delete legacy.fontSize;
  const scope={note:{...makeNote(),font:'NanumBrushScript',fontSize:40,convertedGroups:[original,legacy]},change(fn){fn();}};
  const source=readFileSync('src/app.js','utf8');vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function freezeGroupFonts('),source.indexOf('function toast(')),scope);
  scope.chooseDefaultFont('PoorStory',32);
  assert.equal(scope.note.font,'PoorStory');assert.equal(scope.note.fontSize,32);assert.equal(scope.note.convertedGroups.length,2);
  assert.equal(scope.note.convertedGroups[0].font,'Gaegu');assert.equal(scope.note.convertedGroups[0].fontSize,24);
  assert.equal(scope.note.convertedGroups[1].font,'NanumBrushScript');assert.equal(scope.note.convertedGroups[1].fontSize,40);
  assert.ok(scope.note.convertedGroups.every(g=>g.text==='원문\n여러 줄 유지'));
});

test('override sanitizer is independent and accepts partial style overrides',()=>{
  assert.deepEqual(groupFontOverrides({font:'Gaegu'}),{font:'Gaegu'});assert.deepEqual(groupFontOverrides({fontSize:40}),{fontSize:40});assert.deepEqual(groupFontOverrides({font:'unsafe',fontSize:24}),{fontSize:24});
});
