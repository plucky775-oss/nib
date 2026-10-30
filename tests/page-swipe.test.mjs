import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPageSwipe} from '../src/page-swipe.js';
import {movePaperView} from '../src/paper-viewport.js';

function harness(nativeTouch = true) {
 const handlers = {}, calls = [], hints = [], state = {page:'a', allowed:true, blank:true, before:0, revision:0, rect:{left:0,top:0,width:500,height:500}, view:{scale:1,x:0,y:0}};
 const canvas = {contains:t=>t?.parent===canvas}, surface = {contains:t=>t===canvas||t?.parent===canvas,getBoundingClientRect:()=>({...state.rect})};
 const root = {hidden:false,addEventListener:(n,f)=>handlers[n]=f,removeEventListener:n=>delete handlers[n]};
 const viewport = {revision:()=>state.revision,begin:center=>({view:{...state.view},center}),move(start,center,ratio){state.view=movePaperView(start.view,start.center,center,ratio,{width:500,height:500,paperWidth:500,paperHeight:1000});return true;}};
 let ui; ui=mountPageSwipe({canvas,surface,root,nativeTouch,viewport,getPageId:()=>state.page,canStart:()=>state.allowed,canAdd:()=>state.blank,beforeStart(){state.before++;ui.cancel()},addPage(){calls.push('add');return state.result},onProgress:s=>hints.push(s)});
 const touch=(id,x,y=200,extra={})=>({identifier:id,clientX:x,clientY:y,target:canvas,...extra});
 const send=(type,touches,changedTouches=touches)=>{const e={touches,changedTouches,cancelable:true,preventDefault(){this.prevented=true}};handlers[type]?.(e);return e};
 const pointer=(type,id,x,y=200,extra={})=>{const e={pointerId:id,pointerType:'touch',target:canvas,clientX:x,clientY:y,cancelable:true,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra};handlers[type]?.(e);return e};
 const swipe=(dx=-180,dy=0)=>{send('touchstart',[touch(1,300)]);send('touchmove',[touch(1,300+dx,200+dy)]);send('touchend',[],[touch(1,300+dx,200+dy)]);};
 return {ui,state,root,handlers,canvas,surface,calls,hints,touch,send,pointer,swipe};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};

test('long one-finger left drag adds once on release without moving the paper',()=>{
 const h=harness(),before={...h.state.view};h.send('touchstart',[h.touch(1,300)]);assert.equal(h.send('touchmove',[h.touch(1,120)]).prevented,true);assert.deepEqual(h.calls,[]);assert.equal(h.hints.at(-1).ready,true);assert.deepEqual(h.state.view,before);
 h.send('touchend',[],[h.touch(1,120)]);h.send('touchend',[],[h.touch(1,120)]);assert.deepEqual(h.calls,['add']);assert.equal(h.hints.at(-1),null);
});
test('taps, short, rightward, vertical and diagonal drags neither add nor pan',()=>{
 for(const [x,y] of [[0,0],[-139,0],[200,0],[0,200],[-180,120]]){const h=harness();h.swipe(x,y);assert.deepEqual(h.calls,[]);assert.deepEqual(h.state.view,{scale:1,x:0,y:0});}
});
test('returning below threshold disarms; vertical intent cannot turn into page creation',()=>{
 for(const vertical of [false,true]){const h=harness();h.send('touchstart',[h.touch(1,300)]);h.send('touchmove',[h.touch(1,vertical?300:100,vertical?300:200)]);h.send('touchmove',[h.touch(1,vertical?100:280)]);h.send('touchend',[],[h.touch(1,vertical?100:280)]);assert.deepEqual(h.calls,[]);}
});
test('release coordinate is used even if last move was not delivered',()=>{const h=harness();h.send('touchstart',[h.touch(1,300)]);h.send('touchend',[],[h.touch(1,120)]);assert.deepEqual(h.calls,['add']);});
test('invalid final pointer and missing final coordinates cannot create a page',()=>{for(const changed of [[],[{identifier:99,clientX:100,clientY:200}]]){const h=harness();h.send('touchstart',[h.touch(1,300)]);h.send('touchmove',[h.touch(1,100)]);h.send('touchend',[],changed);assert.deepEqual(h.calls,[]);}});
test('content, finger-writing and editing modes opt out of creation and pointer interception',()=>{const h=harness();h.state.blank=false;h.swipe();assert.deepEqual(h.calls,[]);assert.equal(h.pointer('pointermove',1,100).stopped,undefined);});
test('two fingers pan the paper only; no page is created or navigated',()=>{const h=harness(),start=[h.touch(1,200,300),h.touch(2,300,300)],last=[h.touch(1,200,100),h.touch(2,300,100)];assert.equal(h.send('touchstart',start).prevented,true);h.send('touchmove',last);assert.equal(h.state.view.y,-200);h.send('touchend',[],last);assert.deepEqual(h.calls,[]);assert.equal(h.state.before,1);});
test('pinch zoom anchors the center and preserves original coordinates; browser event is prevented',()=>{const h=harness();h.send('touchstart',[h.touch(1,200,250),h.touch(2,300,250)]);const e=h.send('touchmove',[h.touch(1,150,250),h.touch(2,350,250)]);assert.equal(e.prevented,true);assert.deepEqual(h.state.view,{scale:2,x:-250,y:-250});assert.deepEqual(h.calls,[]);});
test('1 -> 2 -> 1 cannot promote the remaining finger to drawing or creation',()=>{const h=harness();h.send('touchstart',[h.touch(1,300)]);h.send('touchstart',[h.touch(1,300),h.touch(2,400)]);h.send('touchend',[h.touch(1,300)],[h.touch(2,400)]);h.send('touchmove',[h.touch(1,50)]);assert.equal(h.pointer('pointermove',1,50).stopped,true);h.send('touchend',[],[h.touch(1,50)]);assert.deepEqual(h.calls,[]);h.swipe();assert.deepEqual(h.calls,['add']);});
test('third touch cancels until all fingers release',()=>{const h=harness();h.send('touchstart',[h.touch(1,300),h.touch(2,400)]);h.send('touchstart',[h.touch(1,300),h.touch(2,400),h.touch(3,450)]);h.send('touchend',[h.touch(1,300)],[h.touch(2,400),h.touch(3,450)]);h.send('touchend',[],[h.touch(1,50)]);assert.deepEqual(h.calls,[]);h.swipe();assert.deepEqual(h.calls,['add']);});
test('page switch, resize, viewport reset, hidden, touchcancel and Pencil interrupt cancel creation',()=>{
 for(const action of [h=>h.state.page='b',h=>h.state.rect.width+=2,h=>h.state.rect.top+=2,h=>h.state.revision++,h=>{h.root.hidden=true;h.handlers.visibilitychange()},h=>h.send('touchcancel',[],[]),h=>h.pointer('pointerdown',9,200,200,{pointerType:'pen'})]){
 const h=harness();h.send('touchstart',[h.touch(1,300)]);action(h);h.send('touchend',[],[h.touch(1,50)]);assert.deepEqual(h.calls,[]);}
});
test('disabled, palm, stylus and outside contacts cannot own a gesture',()=>{
 for(const extra of [{radiusX:50,radiusY:50},{touchType:'stylus'},{target:{}}]){const h=harness();h.send('touchstart',[h.touch(1,300,200,extra)]);h.send('touchend',[],[h.touch(1,50,200,extra)]);assert.deepEqual(h.calls,[]);assert.equal(h.state.before,0);}
 const h=harness();h.state.allowed=false;h.swipe();assert.deepEqual(h.calls,[]);
});
test('Pencil contact prevents palm pinch from cancelling a live stroke',()=>{const h=harness();h.pointer('pointerdown',9,200,200,{pointerType:'pen'});h.send('touchstart',[h.touch(1,300),h.touch(2,400)]);assert.equal(h.state.before,0);assert.equal(h.ui.hasGesture(),false);h.pointer('pointerup',9,200,200,{pointerType:'pen'});h.send('touchend',[],[h.touch(1,300),h.touch(2,400)]);h.swipe();assert.deepEqual(h.calls,['add']);});
test('mixed toolbar/paper multi-touch is cancelled without taking over toolbar-only scroll',()=>{const h=harness(),outside=h.touch(2,400,200,{target:{}});assert.equal(h.send('touchstart',[outside]).prevented,undefined);h.send('touchend',[],[outside]);h.send('touchstart',[h.touch(1,300),outside]);assert.equal(h.state.before,0);h.send('touchend',[],[h.touch(1,100),outside]);assert.deepEqual(h.calls,[]);});
test('busy async save locks page creation, and failure releases without automatic retry',async()=>{const h=harness();let release;h.state.result=new Promise(r=>release=r);h.swipe();h.swipe();assert.deepEqual(h.calls,['add']);release(false);await settle();h.state.result=Promise.reject(Error('disk'));h.swipe();await settle();assert.deepEqual(h.calls,['add','add']);h.state.result=true;h.swipe();await settle();assert.deepEqual(h.calls,['add','add','add']);});
test('touch stream survives pointercancel; touchcancel cancels it authoritatively',()=>{for(const cancel of [false,true]){const h=harness();h.send('touchstart',[h.touch(1,300)]);h.pointer('pointercancel',1,300);if(cancel)h.send('touchcancel',[],[]);h.send('touchend',[],[h.touch(1,50)]);assert.deepEqual(h.calls,cancel?[]:['add']);}});
test('pointer-only devices use one pipeline and release creates only once',()=>{const h=harness(false);assert.equal(h.pointer('pointerdown',1,300).stopped,true);h.pointer('pointermove',1,100);h.pointer('pointerup',1,100);h.pointer('pointerup',1,100);assert.deepEqual(h.calls,['add']);});
test('pointer-only two fingers zoom, block remaining contact, and never add',()=>{const h=harness(false);h.pointer('pointerdown',1,200);h.pointer('pointerdown',2,300);h.pointer('pointermove',1,150);h.pointer('pointermove',2,350);assert.equal(h.state.view.scale,2);h.pointer('pointerup',2,350);assert.equal(h.pointer('pointermove',1,10).stopped,true);h.pointer('pointerup',1,10);assert.deepEqual(h.calls,[]);h.pointer('pointerdown',3,300);h.pointer('pointerup',3,100);assert.deepEqual(h.calls,['add']);});
test('pointer-only cancellation cannot commit after lost stream',()=>{const h=harness(false);h.pointer('pointerdown',1,300);h.pointer('pointermove',1,100);h.pointer('pointercancel',1,100);h.pointer('pointerup',1,100);assert.deepEqual(h.calls,[]);});
test('dispose removes every listener and pending hint',()=>{const h=harness();h.send('touchstart',[h.touch(1,300)]);h.ui.dispose();assert.deepEqual(Object.keys(h.handlers),[]);assert.equal(h.ui.hasGesture(),false);assert.equal(h.hints.at(-1),null);});
