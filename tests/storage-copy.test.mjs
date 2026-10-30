import test from 'node:test';
import assert from 'node:assert/strict';

// Same transaction/working-copy model as storage-batch.test.mjs, with a held
// database open to exercise mutation while commit is awaiting external work.
// The fake uses a captured native clone so tests can count application clones
// separately from IndexedDB's required serialization.
const clone=globalThis.structuredClone;let instance=0;
async function harness(initial=[],fault={}){
 const state={rows:new Map(initial.map(n=>[n.id,clone(n)])),transactions:0,trace:[],opens:0};let pendingOpen;
 const database={close(){},transaction(){if(fault.transaction)throw Error('mock transaction failure');state.transactions++;let working=new Map([...state.rows].map(([k,v])=>[k,clone(v)])),aborted=false,scheduled=false;const queue=[];
  const tx={error:null,abort(){if(aborted)return;aborted=true;queueMicrotask(()=>tx.onabort?.());},objectStore(){return {
   get(id){const r={};queue.push(()=>{state.trace.push('get:'+id);if(fault.read===id){r.error=Error('mock read failure');r.onerror?.();if(!aborted)tx.abort();return;}r.result=clone(working.get(id));r.onsuccess?.();});schedule();return r;},
   put(note){state.trace.push('put-queued:'+note.id);if(fault.putSync===note.id)throw Error('mock synchronous put failure');const value=clone(note);queue.push(()=>{if(fault.put===note.id){tx.error=Error('mock quota failure');tx.abort();tx.onerror?.();return;}working.set(value.id,value);});schedule();return {};}
  };}};
  function schedule(){if(!scheduled){scheduled=true;queueMicrotask(pump);}}
  function pump(){scheduled=false;if(aborted)return;const action=queue.shift();if(action){action();if(!aborted)schedule();}else{state.rows=working;tx.oncomplete?.();}}
  return tx;
 }};
 globalThis.indexedDB={open(){state.opens++;const r={};const finish=()=>{if(fault.open){r.error=Error('mock open failure');r.onerror?.();}else{r.result=database;r.onsuccess?.();}};if(fault.holdOpen)pendingOpen=finish;else queueMicrotask(finish);return r;}};
 const api=await import('../src/storage.js?copy-test='+instance++);
 return {...api,state,fault,releaseOpen(){assert.ok(pendingOpen,'Database open is pending');pendingOpen();pendingOpen=null;}};
}
const revisions=(...pairs)=>new Map(pairs);
const page=(id='a',title='captured')=>({id,title,text:'원문\n보존',notebookId:'book',pageOrder:1,cover:'clay-arch',paperTheme:'ivory-corner',penKind:'pencil',strokes:[{id:'raw',points:[{x:10,y:20,pressure:.3}]}],convertedGroups:[{id:'text',text:'변환 글',strokeIds:['raw'],bounds:{x:30,y:40,width:100,height:80}}],drawingObjects:[{id:'table',type:'table',cells:[['첫째','둘째']]}]});
const original=[{...page('a','old a'),_revision:2},{...page('b','old b'),_revision:7}];

test('prepare captures deep input synchronously, opens no database, and exposes only immutable IDs plus commit',async()=>{
 const h=await harness(),input=[page()],expected=clone(input[0]),job=h.prepareNotesSave(input);await Promise.resolve();assert.equal(h.state.opens,0);assert.deepEqual(Reflect.ownKeys(job),['ids','commit']);assert.ok(Object.isFrozen(job));assert.ok(Object.isFrozen(job.ids));assert.deepEqual(job.ids,['a']);
 assert.throws(()=>job.ids.push('extra'),TypeError);assert.throws(()=>job.ids[0]='other',TypeError);assert.throws(()=>job.commit=()=>{},TypeError);
 input[0].id='changed-id';input[0].title='changed';input[0].strokes[0].points[0].x=999;input[0].convertedGroups[0].bounds.x=777;input[0].drawingObjects[0].cells[0][0]='changed';input.splice(0,1,page('different'));
 const result=await job.commit(revisions(['a',0]));assert.deepEqual([...result],[['a',1]]);assert.deepEqual(h.state.rows.get('a'),{...expected,_revision:1});assert.equal(h.state.rows.size,1);
});

test('preparation performs one application clone per page and commit performs no second deep copy',async()=>{
 const h=await harness(),pages=[page('a'),page('b')];let clones=0;globalThis.structuredClone=(...args)=>{clones++;return clone(...args);};
 try{const job=h.prepareNotesSave(pages);assert.equal(clones,2);await job.commit(revisions(['a',0],['b',0]));assert.equal(clones,2,'IndexedDB serialization is separate, but storage must not repeat the application copy');}finally{globalThis.structuredClone=clone;}
});

test('public saveNotesBatch preserves defensive snapshot-before-first-await semantics with one clone',async()=>{
 const h=await harness([],{holdOpen:true}),input=page(),expected=revisions(['a',0]),before=clone(input);let clones=0;globalThis.structuredClone=(...args)=>{clones++;return clone(...args);};
 try{const pending=h.saveNotesBatch([input],expected);assert.equal(clones,1);input.title='later';input.strokes[0].points.push({x:300,y:400});expected.set('a',50);h.releaseOpen();await pending;assert.equal(clones,1);assert.deepEqual(h.state.rows.get('a'),{...before,_revision:1});}finally{globalThis.structuredClone=clone;}
});

test('commit copies revision expectations before database await and ignores subsequent map mutations',async()=>{
 const h=await harness(original,{holdOpen:true}),job=h.prepareNotesSave(original),expected=revisions(['a',2],['b',7]);const pending=job.commit(expected);expected.set('a',100);expected.delete('b');h.releaseOpen();assert.deepEqual([...await pending],[['a',3],['b',8]]);assert.equal(h.state.rows.get('a')._revision,3);assert.equal(h.state.rows.get('b')._revision,8);
});

test('two prepared queued snapshots use revisions at commit execution, not at preparation',async()=>{
 const h=await harness(),input=page(),first=h.prepareNotesSave([input]);input.title='second snapshot';const second=h.prepareNotesSave([input]);input.title='third unsaved input';const expected=revisions(['a',0]);
 const firstResult=await first.commit(expected);assert.equal(h.state.rows.get('a').title,'captured');for(const [id,rev]of firstResult)expected.set(id,rev);const secondResult=await second.commit(expected);assert.equal(h.state.rows.get('a').title,'second snapshot');assert.equal(h.state.rows.get('a')._revision,2);assert.deepEqual([...secondResult],[['a',2]]);assert.equal(input.title,'third unsaved input');
});

test('one prepared job cannot be committed twice concurrently or after completion',async()=>{
 const h=await harness([],{holdOpen:true}),job=h.prepareNotesSave([page()]),expected=revisions(['a',0]),pending=job.commit(expected);await assert.rejects(job.commit(expected),/이미 사용/);assert.equal(h.state.opens,1);h.releaseOpen();await pending;await assert.rejects(job.commit(revisions(['a',1])),/이미 사용/);assert.equal(h.state.transactions,1);assert.equal(h.state.rows.get('a')._revision,1);
});

test('expected-map validation consumes a job before any database access; retry requires new preparation',async()=>{
 const h=await harness(),job=h.prepareNotesSave([page()]);await assert.rejects(job.commit(new Map()),/버전/);await assert.rejects(job.commit(revisions(['a',0])),/이미 사용/);assert.equal(h.state.opens,0);assert.deepEqual([...await h.prepareNotesSave([page()]).commit(revisions(['a',0]))],[['a',1]]);
});

test('invalid pages, duplicate IDs and uncloneable data fail synchronously before a job or database is created',async()=>{
 const h=await harness();for(const input of [null,{},[null],[42],[{}],[{id:''}],[{id:'x'.repeat(101)}],[page(),page()],[{id:'a',callback(){}}]])assert.throws(()=>h.prepareNotesSave(input));assert.equal(h.state.opens,0);assert.equal(h.state.transactions,0);
});

test('invalid expected revision types fail before opening storage and never mutate the caller map',async()=>{
 const h=await harness();for(const expected of [undefined,{},new Map(),revisions(['a',-1]),revisions(['a',NaN]),revisions(['a',Infinity]),revisions(['a',1.5]),revisions(['a','0']),revisions(['a',Number.MAX_SAFE_INTEGER])]){const before=expected instanceof Map?[...expected]:expected;await assert.rejects(h.prepareNotesSave([page()]).commit(expected));if(expected instanceof Map)assert.deepEqual([...expected],before);}assert.equal(h.state.opens,0);
});

test('empty prepared and public batches preserve no-op behavior without requiring expectations or opening storage',async()=>{
 const h=await harness(),job=h.prepareNotesSave([]);assert.deepEqual(job.ids,[]);assert.ok(Object.isFrozen(job.ids));assert.deepEqual([...await job.commit()],[]);await assert.rejects(job.commit(),/이미 사용/);assert.deepEqual([...await h.saveNotesBatch([])],[]);assert.equal(h.state.opens,0);
});

test('all stored revisions are checked before the first write and unrelated records stay unchanged',async()=>{
 const unrelated={...page('unrelated','do not touch'),_revision:11},h=await harness([...original,unrelated]);const changed=original.map(p=>({...p,title:'updated'})),result=await h.prepareNotesSave(changed).commit(revisions(['a',2],['b',7]));
 assert.equal(h.state.transactions,1);assert.deepEqual(h.state.trace.slice(0,2),['get:a','get:b']);assert.deepEqual(h.state.trace.slice(2),['put-queued:a','put-queued:b']);assert.deepEqual([...result],[['a',3],['b',8]]);assert.deepEqual(h.state.rows.get('unrelated'),unrelated);
 for(const p of changed)assert.deepEqual(h.state.rows.get(p.id),{...p,_revision:p._revision+1});
});

test('stale later-page conflict aborts the whole prepared job before any put',async()=>{
 const h=await harness(original),job=h.prepareNotesSave(original.map(p=>({...p,title:'must not save'})));await assert.rejects(job.commit(revisions(['a',2],['b',6])),/다른 창/);assert.deepEqual([...h.state.rows.values()],original);assert.ok(!h.state.trace.some(x=>x.startsWith('put-queued')));await assert.rejects(job.commit(revisions(['a',2],['b',7])),/이미 사용/);assert.equal(h.state.transactions,1);
});

for(const [name,fault,pattern]of [['read',{read:'b'},/read/],['queued second put',{put:'b'},/quota/],['synchronous second put',{putSync:'b'},/synchronous/],['database open',{open:true},/open/],['transaction creation',{transaction:true},/transaction/]])test(`${name} failure preserves all rows and consumes only that prepared job`,async()=>{
 const h=await harness(original,fault),job=h.prepareNotesSave(original.map(p=>({...p,title:'failed update'}))),expected=revisions(['a',2],['b',7]);await assert.rejects(job.commit(expected),pattern);assert.deepEqual([...h.state.rows.values()],original);assert.deepEqual([...expected],[['a',2],['b',7]]);const transactions=h.state.transactions,opens=h.state.opens;await assert.rejects(job.commit(expected),/이미 사용/);assert.equal(h.state.transactions,transactions);assert.equal(h.state.opens,opens);
 for(const key of Object.keys(fault))delete fault[key];const fresh=h.prepareNotesSave(original.map(p=>({...p,title:'retried fresh snapshot'})));await fresh.commit(expected);assert.equal(h.state.rows.get('a').title,'retried fresh snapshot');assert.equal(h.state.rows.get('b').title,'retried fresh snapshot');
});

test('returned revision map is detached from saved records and subsequent jobs',async()=>{
 const h=await harness(),input=page(),expected=revisions(['a',0]),result=await h.prepareNotesSave([input]).commit(expected);result.set('a',999);result.set('extra',99);assert.equal(h.state.rows.get('a')._revision,1);assert.equal(expected.get('a'),0);await h.prepareNotesSave([{...input,title:'next'}]).commit(revisions(['a',1]));assert.equal(h.state.rows.get('a')._revision,2);assert.equal(h.state.rows.size,1);
});
