/** Compact navigation only: existing controls/handlers remain authoritative. */
export function mountEditorMenus({root=document,beforeOpen=()=>{},getDrawing=()=>null}){
 const $=id=>root.getElementById(id),panels={insert:$('insert-menu'),tool:$('tool-menu'),document:$('document-menu')},toggles={insert:$('insert-menu-toggle'),tool:$('tool-menu-toggle'),document:$('document-menu-toggle')};
 let suppressTouch=false,current=null,drawingState={active:false,tool:'select',panelOpen:false,selected:null};
 const labels={select:'도형 선택·이동',line:'직선',arrow:'화살표',rectangle:'사각형',ellipse:'타원',triangle:'삼각형',diamond:'마름모',table:'표'};
 const contains=(parent,target)=>parent===target||!!parent?.contains?.(target);
 function position(){
  if(!current)return;const panel=panels[current],button=toggles[current],r=button.getBoundingClientRect?.();
  if(!r)return;const win=root.defaultView,width=win?.innerWidth||1024,height=win?.innerHeight||768;
  const top=Math.min(r.bottom+6,Math.max(8,height-160));panel.style.top=top+'px';panel.style.maxHeight=Math.max(100,height-top-12)+'px';panel.style.right=Math.min(Math.max(8,width-r.right),Math.max(8,width-(panel.offsetWidth||320)-8))+'px';
 }
 function close({restoreFocus=false}={}){if(!current)return;const key=current;current=null;panels[key].hidden=true;toggles[key].setAttribute('aria-expanded','false');if(restoreFocus)toggles[key].focus();}
 function syncTool(){
  const tool=$('eraser').getAttribute('aria-pressed')==='true'?'eraser':$('select').getAttribute('aria-pressed')==='true'?'select':'pen';
  $('pen-tool-options').hidden=tool!=='pen';$('eraser-options').hidden=tool!=='eraser';$('select-tool-options').hidden=tool!=='select';
  const label=drawingState.active?'도형 옵션':tool==='pen'?'펜 옵션':tool==='eraser'?'지우개 크기':'선택 안내';$('tool-menu-label').textContent=label;toggles.tool.setAttribute('aria-label',label);
 }
 function syncDrawing(state){
  drawingState=state||{active:false};$('drawing-mode-bar').hidden=!drawingState.active;
  $('drawing-mode-label').textContent=drawingState.active?(labels[drawingState.tool]||'그림')+' · '+(drawingState.tool==='select'?'도형을 눌러 고치거나 옮기세요':'종이에 끌어서 그리세요'):'';
  syncTool();
 }
 function open(key){
  if(!panels[key])return;if(current===key){close({restoreFocus:true});return;}
  close();beforeOpen();getDrawing()?.hidePanel?.();syncTool();
  if(key==='tool'&&drawingState.active){getDrawing()?.open?.();return;}
  current=key;panels[key].hidden=false;toggles[key].setAttribute('aria-expanded','true');position();
  panels[key].querySelector?.('button:not([disabled]),select,input')?.focus();
 }
 for(const key of Object.keys(panels))toggles[key].addEventListener('click',()=>open(key));
 for(const button of root.querySelectorAll('[data-close-editor-menu]'))button.addEventListener('click',()=>close({restoreFocus:true}));
 $('insert-freehand').addEventListener('click',()=>{close();getDrawing()?.deactivate?.();$('pen').click();});
 $('insert-table').addEventListener('click',()=>{close();getDrawing()?.open?.('table');});
 $('drawing-options').addEventListener('click',()=>{close();getDrawing()?.open?.();});
 $('drawing-done').addEventListener('click',()=>{getDrawing()?.deactivate?.();$('pen').click();});
 root.addEventListener('pointerdown',e=>{
  if(!current||contains(panels[current],e.target)||Object.values(toggles).some(b=>contains(b,e.target)))return;
  close();
  // A tap used to dismiss a menu is not a pen stroke or page swipe.
  if(contains($('paper-viewport'),e.target)){suppressTouch=e.pointerType==='touch';e.preventDefault();e.stopImmediatePropagation();}
 },{capture:true});
 for(const type of ['touchstart','touchmove','touchend','touchcancel'])root.addEventListener(type,e=>{if(!suppressTouch)return;e.preventDefault();e.stopImmediatePropagation();if((type==='touchend'||type==='touchcancel')&&!e.touches?.length)suppressTouch=false;},{capture:true,passive:false});
 root.addEventListener('click',e=>{
  if(!current||!contains(panels[current],e.target))return;
  const button=e.target.closest?.('button');if(button&&!button.hasAttribute('data-close-editor-menu'))close();
 },{capture:true});
 root.addEventListener('keydown',e=>{if(current&&e.key==='Escape'){e.preventDefault();e.stopPropagation();close({restoreFocus:true});}});
 root.addEventListener('focusin',e=>{if(current&&!contains(panels[current],e.target)&&!Object.values(toggles).some(b=>contains(b,e.target)))close();});
 for(const key of ['paper','width','color','eraser-size','pan-page'])$(key).addEventListener('change',()=>close());
 // Pointer and programmatic legacy tool changes share the same pressed state.
 const Observer=root.defaultView?.MutationObserver;
 if(Observer){const observer=new Observer(syncTool);for(const key of ['pen','eraser','select'])observer.observe($(key),{attributes:true,attributeFilter:['aria-pressed']});}
 root.defaultView?.addEventListener('resize',position);
 root.addEventListener('visibilitychange',()=>{if(root.hidden){suppressTouch=false;close();}});
 syncTool();return {open,close,syncTool,syncDrawing,getOpen:()=>current};
}
