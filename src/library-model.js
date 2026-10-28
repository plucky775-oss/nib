import {listNotebooks,notebookId} from './notebooks.js';
/** Library search covers notebook titles only, never unrecognized handwriting. */
export function deriveLibrary(notes,{query='',sort='recent',favoritesOnly=false}={}){
 const needle=typeof query==='string'?query.trim().toLocaleLowerCase('ko-KR'):'';
 return listNotebooks(notes).map((book,index)=>({...book,updatedAt:Math.max(0,...book.pages.map(page=>Number.isFinite(page.updatedAt)?page.updatedAt:0)),favorite:book.pages.some(page=>page.favorite===true),coverPage:book.pages[0],index}))
  .filter(book=>(!favoritesOnly||book.favorite)&&(!needle||book.title.toLocaleLowerCase('ko-KR').includes(needle)))
  .sort((a,b)=>(sort==='name'?a.title.localeCompare(b.title,'ko'):b.updatedAt-a.updatedAt)||a.index-b.index)
  .map(({index,...book})=>book);
}
/** Metadata-only immutable toggle; preserve content timestamps and raw ink. */
export function setNotebookFavorite(notes,bookId,value){
 const favorite=value===true;
 return notes.map(page=>notebookId(page)===bookId&&page.favorite!==favorite?{...page,favorite}:page);
}
