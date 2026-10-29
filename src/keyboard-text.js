import {maxStrokeRadius} from './pen-renderer.js';
import {appendTextObject,groupFontOverrides} from './converted-groups.js';
import {id as createId,validateNote,FONTS} from './core.js';
export function addKeyboardText(note,text,{id=createId(),font=note.font,fontSize=note.fontSize,bounds}={}){
 if(typeof text!=='string'||!text.trim())throw Error('추가할 글을 입력해주세요.');
 const existing=note.convertedGroups||[],groups=existing.length?existing:note.text?.trim()?validateNote(note).convertedGroups:existing;
 const style={font:FONTS[0].id,fontSize:32,...groupFontOverrides({font,fontSize})};
 if(bounds===undefined){const height=Math.min(360,Math.max(100,text.split('\n').length*style.fontSize*1.4+24));let bottom=groups.reduce((n,g)=>Math.max(n,g.bounds.y+g.bounds.height),132);for(const stroke of note.strokes||[]){const radius=maxStrokeRadius(stroke);for(const p of stroke.points||[])if(Number.isFinite(p.y))bottom=Math.max(bottom,p.y+radius);}let y=bottom+24;if(y+height>1176)y=156+(groups.length%6)*24;if(y+height>1200)y=1200-height;bounds={x:72,y,width:756,height};}
 const object={kind:'text-object',id,text,strokeIds:[],bounds:{...bounds},...style};
 const convertedGroups=appendTextObject(groups,object);
 return {...note,convertedGroups,text:convertedGroups.map(g=>g.text).join('\n'),textPlacementMissing:false,mode:'text',showOriginal:false};
}
/** Dedicated typed-text insertion. No recognizer or network dependency. */
export function mountKeyboardText({getNote,beforeOpen=()=>{},apply,notify=()=>{},getFonts=()=>FONTS,root=document}){
 const $=id=>root.getElementById(id),dialog=$('text-edit-dialog'),editor=$('text-editor'),font=$('text-input-font'),size=$('text-input-size'),error=$('text-input-error'),save=$('save-text-edit');
 let draft=null,composing=false,busy=false,fonts=[];
 const message=text=>{error.textContent=text;error.hidden=!text;};
 const preview=()=>{const selected=fonts.find(f=>f.id===font.value);editor.style.fontFamily=selected?.family||selected?.id||FONTS[0].id;editor.style.fontSize=([24,32,40].includes(Number(size.value))?Number(size.value):32)+'px';};
 const cancel=()=>{if(busy)return;draft=null;composing=false;message('');dialog.close();};
 const open=()=>{if(busy)return;beforeOpen();const note=getNote();if(!note)return;fonts=getFonts().filter(f=>f&&typeof f.id==='string');font.replaceChildren(...fonts.map(f=>{const option=root.createElement('option');option.value=f.id;option.textContent=f.name||f.id;return option}));font.value=fonts.some(f=>f.id===note.font)?note.font:(fonts[0]?.id||FONTS[0].id);size.value=String([24,32,40].includes(note.fontSize)?note.fontSize:32);draft={pageId:note.id,id:createId()};composing=false;editor.value='';save.disabled=false;message('');preview();if(!dialog.open)dialog.showModal();editor.focus();};
 async function submit(){if(!draft||busy)return;if(composing){message('한글 입력을 마친 뒤 추가해주세요.');return;}const current=getNote();if(!current||current.id!==draft.pageId){message('페이지가 바뀌었습니다. 닫고 다시 입력해주세요.');return;}let next;try{next=addKeyboardText(current,editor.value,{id:draft.id,font:font.value,fontSize:Number(size.value)});}catch(e){message(e.message);return;}busy=true;save.disabled=true;try{const accepted=await apply(next);if(accepted===false){message('글을 추가하지 못했습니다. 입력 내용은 유지됩니다.');return;}draft=null;dialog.close();message('');notify('키보드 글을 추가했습니다. 선택해서 옮기거나 수정할 수 있어요.');}catch(e){message(e.message||'글을 추가하지 못했습니다.');}finally{busy=false;save.disabled=false;}}
 $('keyboard-text')?.addEventListener('click',open);$('edit-text')?.addEventListener('click',open);$('cancel-text-edit').addEventListener('click',cancel);save.addEventListener('click',submit);font.addEventListener('change',preview);size.addEventListener('change',preview);
 editor.addEventListener('compositionstart',()=>{composing=true;});editor.addEventListener('compositionend',()=>{composing=false;message('');});
 dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});dialog.addEventListener('close',()=>{if(!busy)draft=null;});
 return {open,cancel,submit};
}
