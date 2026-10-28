import {COVER_PRESETS,normalizeCover} from './notebook-covers.js';
import {listNotebooks,notebookId} from './notebooks.js';
/** Library search covers notebook titles only, never unrecognized handwriting. */
export function deriveLibrary(notes,{query='',sort='recent',favoritesOnly=false}={}){
 const needle=typeof query==='string'?query.trim().toLocaleLowerCase('ko-KR'):'';
 return listNotebooks(notes).map((book,index)=>({...book,updatedAt:Math.max(0,...book.pages.map(page=>Number.isFinite(page.updatedAt)?page.updatedAt:0)),favorite:book.pages.some(page=>page.favorite===true),coverPage:book.pages[0],cover:normalizeCover(book.pages[0]?.cover),index}))
  .filter(book=>(!favoritesOnly||book.favorite)&&(!needle||book.title.toLocaleLowerCase('ko-KR').includes(needle)))
  .sort((a,b)=>(sort==='name'?a.title.localeCompare(b.title,'ko'):b.updatedAt-a.updatedAt)||a.index-b.index)
  .map(({index,...book})=>book);
}
/** Metadata-only immutable toggle; preserve content timestamps and raw ink. */
export function setNotebookFavorite(notes,bookId,value){
 const favorite=value===true;
 return notes.map(page=>notebookId(page)===bookId&&page.favorite!==favorite?{...page,favorite}:page);
}

/** Validated notebook-wide metadata edit; content and modification times survive. */
export function setNotebookMetadata(notes,bookId,{title,cover}={}){
 const patch={};
 if(title!==undefined){if(typeof title!=='string'||!title.trim()||title.trim().length>120)throw Error('노트 제목은 공백을 제외하고 1~120자로 입력해주세요.');patch.title=title.trim();}
 if(cover!==undefined){if(!COVER_PRESETS.some(p=>p.id===cover))throw Error('지원하는 노트 표지를 선택해주세요.');patch.cover=cover;}
 return notes.map(page=>notebookId(page)===bookId&&Object.entries(patch).some(([key,value])=>page[key]!==value)?{...page,...patch}:page);
}
