import {makeNote,id,validateNote} from './core.js';
const validBookId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const order=page=>Number.isSafeInteger(page.pageOrder)&&page.pageOrder>=0?page.pageOrder:0;
/** Legacy flat notes are independent one-page notebooks without modifying data. */
export function notebookId(page){return validBookId(page.notebookId)?page.notebookId:page.id;}
export function pagesFor(notes,bookId){return notes.map((page,index)=>({page,index})).filter(({page})=>notebookId(page)===bookId).sort((a,b)=>order(a.page)-order(b.page)||a.index-b.index).map(({page})=>page);}
/** Notebook ordering follows first occurrence; pages use stable pageOrder. */
export function listNotebooks(notes){const ids=[...new Set(notes.map(notebookId))];return ids.map(bookId=>{const pages=pagesFor(notes,bookId);return {id:bookId,title:pages[0]?.title||'새 노트',count:pages.length,pages};});}
export function createPage(pages,current){
 if(!current||typeof current.id!=='string')throw Error('현재 노트가 없습니다.');
 if(pages.length>=1000)throw Error('최대 1,000페이지까지 저장할 수 있습니다.');
 const bookId=notebookId(current),siblings=pagesFor(pages,bookId),lastOrder=Math.max(order(current),...siblings.map(order));
 if(lastOrder>=Number.MAX_SAFE_INTEGER)throw Error('페이지 순서를 더 추가할 수 없습니다.');
 const blank=makeNote(),settings=validateNote(current);
 return {...blank,notebookId:bookId,title:current.title,pageOrder:lastOrder+1,font:settings.font,fontSize:settings.fontSize,paper:settings.paper,smooth:settings.smooth,mode:settings.mode,shapeCorrection:settings.shapeCorrection};
}
/** Import as independent copies. IDs within raw strokes/groups remain intact;
 * only page identity and notebook membership are remapped. Call once per import
 * batch so pages in that batch keep their notebook relationships. Reuse both
 * maps for split parts of ONE backupSetId within a session. Re-imported pages
 * have stable new IDs so the UI can skip duplicates. Separate maps (e.g. after
 * reload) produce independent copies; never reuse maps for unrelated backups.
 */
export function cloneImportedPages(pages,{notebookMap=new Map(),pageMap=new Map()}={}){
 if(!Array.isArray(pages)||pages.length>1000)throw Error('지원하지 않는 페이지 수입니다.');
 const validated=pages.map(validateNote);
 const used=new Set([...pages.flatMap(p=>[p.id,notebookId(p)]),...notebookMap.values(),...pageMap.values()]);
 const fresh=()=>{let next;do{next=id()}while(used.has(next));used.add(next);return next;};
 return validated.map(valid=>{const bookId=notebookId(valid);if(!notebookMap.has(bookId))notebookMap.set(bookId,fresh());if(!pageMap.has(valid.id))pageMap.set(valid.id,fresh());return {...structuredClone(valid),id:pageMap.get(valid.id),notebookId:notebookMap.get(bookId)};});
}
