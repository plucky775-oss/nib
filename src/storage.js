const DB='nib-notes-v1';
let connection;
export async function db(){if(connection)return connection;return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('notes',{keyPath:'id'});request.onsuccess=()=>{connection=request.result;connection.onversionchange=()=>{connection.close();connection=null;};resolve(connection)};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('다른 창을 닫고 다시 열어주세요.'));});}
export async function getNotes(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('notes','readonly');const r=tx.objectStore('notes').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export function checkRevision(stored,expected){if((stored?._revision||0)!==expected)throw Error('다른 창에서 이 노트가 변경됐습니다. 현재 내용을 백업하고 새로고침해주세요.');}
export async function saveNote(note,expected=0){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('notes','readwrite');const store=tx.objectStore('notes');const read=store.get(note.id);let issue;read.onsuccess=()=>{try{checkRevision(read.result,expected);store.put({...note,_revision:expected+1});}catch(e){issue=e;tx.abort();}};tx.oncomplete=()=>resolve(expected+1);tx.onerror=()=>reject(issue||tx.error);tx.onabort=()=>reject(issue||tx.error||Error('저장이 중단됐습니다.'));});}
export async function removeNote(id,expected=0){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('notes','readwrite');const store=tx.objectStore('notes');const read=store.get(id);let issue;read.onsuccess=()=>{try{checkRevision(read.result,expected);store.delete(id);}catch(e){issue=e;tx.abort();}};tx.oncomplete=resolve;tx.onerror=()=>reject(issue||tx.error);tx.onabort=()=>reject(issue||tx.error||Error('삭제가 중단됐습니다.'));});}

function validateBatchIds(ids){const unique=new Set();for(const id of ids){if(typeof id!=='string'||!id||id.length>100||unique.has(id))throw Error('페이지 ID가 올바르지 않거나 중복됐습니다.');unique.add(id);}}
function batchExpectations(ids,expectedRevisionsMap){
 if(!(expectedRevisionsMap instanceof Map))throw Error('각 페이지의 예상 버전 정보가 필요합니다.');
 validateBatchIds(ids);const expected=new Map();
 for(const id of ids){const revision=expectedRevisionsMap.get(id);if(!expectedRevisionsMap.has(id)||!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)throw Error('페이지 버전 정보가 올바르지 않습니다.');expected.set(id,revision);}
 return expected;
}
// Queue all reads first; writes only begin in the final read callback after ALL
// revisions pass. IndexedDB's single readwrite transaction provides rollback
// and excludes competing writes until this transaction completes or aborts.
async function commitBatch(ids,expected,mutate){
 const d=await db();return new Promise((resolve,reject)=>{
  const tx=d.transaction('notes','readwrite'),store=tx.objectStore('notes');let issue,remaining=ids.length;
  const abort=error=>{if(issue)return;issue=error;try{tx.abort()}catch{reject(issue)}};
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(issue||tx.error||Error('페이지 변경에 실패했습니다.'));tx.onabort=()=>reject(issue||tx.error||Error('페이지 변경이 중단됐습니다.'));
  try{for(const id of ids){const read=store.get(id);read.onsuccess=()=>{if(issue)return;try{checkRevision(read.result,expected.get(id));remaining--;if(remaining===0)mutate(store);}catch(error){abort(error)}};read.onerror=()=>abort(read.error||Error('페이지를 읽지 못했습니다.'));}}catch(error){abort(error)}
 });
}
// Capture once, synchronously, before a queued save can yield to more input.
// Only immutable IDs escape; page snapshots remain private and are consumed by
// one commit attempt. Revisions are deliberately captured at COMMIT time so an
// earlier queued save can finish and advance the caller's expected revisions.
export function prepareNotesSave(pages){
 if(!Array.isArray(pages))throw Error('저장할 페이지 목록이 필요합니다.');
 let copies=pages.map(page=>{if(!page||typeof page!=='object')throw Error('페이지 정보가 올바르지 않습니다.');return structuredClone(page)});
 const ids=Object.freeze(copies.map(page=>page.id));validateBatchIds(ids);let used=false;
 const commit=async expectedRevisionsMap=>{
  if(used)throw Error('이미 사용한 저장 작업입니다. 현재 페이지로 새 저장 작업을 만들어주세요.');
  used=true;const snapshot=copies;copies=null;
  if(!ids.length)return new Map();
  // Copy before the first await: callers cannot change the transaction's
  // expectations after it starts, including while the database is opening.
  const expected=batchExpectations(ids,expectedRevisionsMap),next=new Map(ids.map(id=>[id,expected.get(id)+1]));
  await commitBatch(ids,expected,store=>{for(const page of snapshot)store.put({...page,_revision:next.get(page.id)});});
  return next;
 };
 return Object.freeze({ids,commit});
}
export async function saveNotesBatch(pages,expectedRevisionsMap){return prepareNotesSave(pages).commit(expectedRevisionsMap);}
export async function removeNotesBatch(ids,expectedRevisionsMap){
 if(!Array.isArray(ids))throw Error('삭제할 페이지 목록이 필요합니다.');if(!ids.length)return;
 const copies=[...ids],expected=batchExpectations(copies,expectedRevisionsMap);
 await commitBatch(copies,expected,store=>{for(const id of copies)store.delete(id);});
}

// Read membership and delete in the same write transaction, so concurrent tabs
// cannot both remove the last two pages. No sibling data is rewritten.
export async function removePageSafely(id,expected=0){
 const d=await db();return new Promise((resolve,reject)=>{
  const tx=d.transaction('notes','readwrite'),store=tx.objectStore('notes');let issue,result;
  const request=store.getAll();request.onsuccess=()=>{try{
   const pages=request.result,target=pages.find(p=>p.id===id);if(!target)throw Error('이미 삭제되었거나 찾을 수 없는 페이지입니다.');checkRevision(target,expected);
   const book=p=>typeof p.notebookId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(p.notebookId)?p.notebookId:p.id;
   if(pages.filter(p=>book(p)===book(target)).length<=1)throw Error('노트에는 최소 한 페이지가 필요합니다. 노트 전체 삭제는 서재에서 해주세요.');
   const remainingPages=structuredClone(pages.filter(p=>p.id!==id&&book(p)===book(target)));
   result={remainingPages,revisions:new Map(remainingPages.map(p=>[p.id,p._revision||0]))};
   store.delete(id);
  }catch(e){issue=e;tx.abort();}};
  request.onerror=()=>{issue=request.error;tx.abort();};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(issue||tx.error);tx.onabort=()=>reject(issue||tx.error||Error('페이지 삭제가 중단됐습니다.'));
 });
}
