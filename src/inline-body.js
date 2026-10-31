import {FONTS,id} from './core.js';
import {getBodyObject,updateBodyText} from './body-text.js';

/** A real textarea on the paper. Native selection/IME never pass through ink gestures. */
export function mountInlineBody({getNote,getFonts=()=>FONTS,beforeOpen=()=>{},apply,onClose=()=>{},notify=()=>{},root=document}){
 const $=key=>root.getElementById(key),editor=$('body-editor'),bar=$('body-controls'),font=$('body-font'),size=$('body-size'),error=$('body-error'),paper=$('page');
 let session=null,composing=false,fonts=[];
 const message=text=>{error.textContent=text;error.hidden=!text;};
 const style=()=>{
  if(!session)return;
  const b=getBodyObject(getNote())?.bounds||{x:72,y:156,width:756,height:1020};
  Object.assign(editor.style,{left:b.x/9+'%',top:b.y/12+'%',width:b.width/9+'%',height:b.height/12+'%',fontFamily:fonts.find(f=>f.id===font.value)?.family||font.value+', NanumPenScript, sans-serif',fontSize:Number(size.value)*(paper.clientWidth||900)/900+'px'});
  const viewport=$('paper-viewport'),rect=paper.getBoundingClientRect?.(),view=viewport?.getBoundingClientRect?.();
  if(rect?.width>0&&view){const scale=rect.width/(paper.clientWidth||900),top=rect.top+b.y*rect.width/900;const visible=Math.max(48,(view.bottom-top)/scale-8);editor.style.height=Math.min(b.height*(paper.clientWidth||900)/900,visible)+'px';}
 };
 const warn=()=>{if(session){const b=getBodyObject(getNote())?.bounds||{height:1020};$('body-overflow').hidden=editor.scrollHeight<=b.height*(paper.clientWidth||900)/900+2;}};
 function commit(){
  if(!session)return true;
  const note=getNote();if(!note||note.id!==session.pageId){message('페이지가 바뀌어 입력을 적용하지 않았습니다.');return false;}
  try{
   const old=getBodyObject(note),text=editor.value;
   if((old?.text||'')===text&&(!old||(old.font===font.value&&old.fontSize===Number(size.value)))){warn();return true;}
   const next=updateBodyText(note,text,{id:session.id,font:font.value,fontSize:Number(size.value)});
   if(apply(next,{checkpoint:!session.changed})===false){message('저장할 내용을 적용하지 못했습니다. 입력은 그대로 유지됩니다.');return false;}
   session.changed=true;message('');style();warn();return true;
  }catch(e){message(e.message||'입력 내용을 적용하지 못했습니다.');return false;}
 }
 function finish(){
  if(!session)return true;
  if(composing){message('한글 조합을 마친 뒤 이동해주세요.');return false;}
  if(!commit())return false;
  session=null;editor.hidden=true;bar.hidden=true;paper.classList.remove('body-editing');root.body?.classList.remove('typing-body');$('keyboard-text').setAttribute('aria-pressed','false');onClose();return true;
 }
 function open(){
  if(session){editor.focus({preventScroll:true});return;}
  beforeOpen();const note=getNote();if(!note)return;const body=getBodyObject(note);
  fonts=getFonts().filter(f=>f&&typeof f.id==='string');font.replaceChildren(...fonts.map(f=>{const o=root.createElement('option');o.value=f.id;o.textContent=f.name||f.id;return o;}));
  const selected=body?.font||note.font;
  // Preserve missing-font identity; the fallback is visual only.
  if(!fonts.some(f=>f.id===selected)){const o=root.createElement('option');o.value=selected;o.textContent='저장된 글씨체 (대체 표시)';font.append(o);}
  font.value=selected;size.value=String(body?.fontSize||note.fontSize||32);
  session={pageId:note.id,id:body?.id||id(),changed:false};composing=false;editor.value=body?.text||'';
  message('');bar.hidden=false;editor.hidden=false;paper.classList.add('body-editing');root.body?.classList.add('typing-body');$('keyboard-text').setAttribute('aria-pressed','true');
  $('body-overlap').hidden=!(note.strokes.length||note.drawingObjects?.length||note.convertedGroups?.some(g=>g.body!==true)||(!body&&note.text?.trim()));
  style();editor.focus({preventScroll:true});editor.setSelectionRange(editor.value.length,editor.value.length);warn();
 }
 $('keyboard-text').addEventListener('click',open);$('edit-text')?.addEventListener('click',open);
 $('body-done').addEventListener('click',()=>{if(finish())$('pen').click();});
 editor.addEventListener('input',()=>commit());
 editor.addEventListener('compositionstart',()=>{composing=true;});
 editor.addEventListener('compositionend',()=>{composing=false;commit();});
 for(const control of [font,size])control.addEventListener('change',()=>{style();commit();editor.focus({preventScroll:true});});
 editor.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&!composing){e.preventDefault();if(finish())$('keyboard-text').focus();}});
 // Finish before other tools, navigation, export or app undo. Do not interfere
 // with native text undo, selection, or controls belonging to this editor.
 root.addEventListener('click',e=>{
  if(!session||bar.contains(e.target)||e.target===editor||e.target.closest?.('#keyboard-text,#edit-text'))return;
  if(e.target.closest?.('button,input,select,a')&&!finish()){e.preventDefault();e.stopImmediatePropagation();notify('입력 내용을 확인한 뒤 다시 시도해주세요.');}
 },true);
 const Resize=root.defaultView?.ResizeObserver;
 if(Resize){const observer=new Resize(()=>{style();warn();});observer.observe(paper);if($('paper-viewport'))observer.observe($('paper-viewport'));}
 root.defaultView?.visualViewport?.addEventListener('resize',()=>{style();warn();});
 const hasPendingDraft=()=>!!session&&((getBodyObject(getNote())?.text||'')!==editor.value);
 root.defaultView?.addEventListener('beforeunload',e=>{if(hasPendingDraft()){e.preventDefault();e.returnValue='';}});
 return {open,finish,commit,hasPendingDraft,isActive:()=>!!session,isComposing:()=>composing};
}
