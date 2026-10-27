import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync}from'node:fs';
const html=readFileSync('index.html','utf8'),js=readFileSync('src/app.js','utf8');
test('all static element ids referenced by app exist',()=>{for(const [,id]of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes('id="'+id+'"'),id)});
test('frontend contains no key or remote model endpoint',()=>{assert.ok(!js.includes('GEMINI_API_KEY'));assert.ok(!js.includes('generativelanguage.googleapis.com'));assert.ok(!html.includes('sk-proj-'))});
test('Pencil defaults and original preservation implemented',()=>{assert.match(js,/acceptsPointer/);assert.match(js,/pointercancel/);assert.match(js,/eventSamples/);assert.match(js,/recognizedSource/);assert.match(html,/원본 필기는 유지됩니다|원본은 변경되지 않습니다/)});
test('five official font files and licenses present',()=>{for(const family of ['NanumPenScript','NanumBrushScript','Gaegu','GamjaFlower','PoorStory']){assert.ok(existsSync(`public/fonts/${family}-Regular.woff2`));assert.ok(existsSync(`public/fonts/${family}-OFL.txt`));}});
