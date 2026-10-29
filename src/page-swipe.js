/** Blank-paper, single-touch page navigation. No note writes or page creation. */
export function mountPageSwipe({canvas,getPageId,canStart,isBlank,navigate,beforeStart=()=>{},root=document,clock=Date.now}){
 let gesture=null,busy=false,disposed=false;const options={capture:true,passive:false};
 const consume=e=>{if(e.cancelable!==false)e.preventDefault();e.stopImmediatePropagation();};
 function release(g){try{if(canvas.hasPointerCapture?.(g.id))canvas.releasePointerCapture(g.id)}catch{}}
 function cancel(){const g=gesture;gesture=null;if(g)release(g);}
 const stableSize=g=>{const r=canvas.getBoundingClientRect();return r&&Number.isFinite(r.width)&&Number.isFinite(r.height)&&Math.abs(r.width-g.width)<=1&&Math.abs(r.height-g.height)<=1;};
 const allowed=()=>{try{return !disposed&&!busy&&canStart()===true}catch{return false}};
 function down(e){
  if(gesture){if(e.pointerId!==gesture.id)cancel();return;}
  if(!allowed()||e.pointerType!=='touch'||e.isPrimary===false||e.button>0||e.width>40||e.height>40)return;
  const rect=canvas.getBoundingClientRect();if(!rect||!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||rect.width<=0||rect.height<=0)return;
  const x=(e.clientX-rect.left)*900/rect.width,y=(e.clientY-rect.top)*1200/rect.height;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>900||y>1200||!isBlank({x,y},e))return;
  const pageId=getPageId();if(pageId===undefined||pageId===null)return;
  beforeStart();if(!allowed()||getPageId()!==pageId)return;
  gesture={id:e.pointerId,pageId,x:e.clientX,y:e.clientY,startedAt:clock(),width:rect.width,height:rect.height};
  consume(e);try{canvas.setPointerCapture(e.pointerId)}catch{cancel();}
 }
 function move(e){if(!gesture||e.pointerId!==gesture.id)return;consume(e);const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!allowed()||!stableSize(gesture)||getPageId()!==gesture.pageId||!Number.isFinite(dx)||!Number.isFinite(dy)||(Math.abs(dy)>=20&&Math.abs(dy)>Math.abs(dx))||Math.abs(dy)>60)cancel();}
 function up(e){if(!gesture||e.pointerId!==gesture.id)return;consume(e);const g=gesture,dx=e.clientX-g.x,dy=e.clientY-g.y,elapsed=clock()-g.startedAt;cancel();if(!allowed()||!stableSize(g)||getPageId()!==g.pageId||!Number.isFinite(dx)||!Number.isFinite(dy)||elapsed<0||elapsed>1500||Math.abs(dx)<80||Math.abs(dx)<Math.abs(dy)*2||Math.abs(dy)>60)return;
  busy=true;try{Promise.resolve(navigate(dx<0?1:-1)).catch(()=>{}).finally(()=>{busy=false})}catch{busy=false;}
 }
 function interrupted(e){if(gesture&&e.pointerId===gesture.id){consume(e);cancel();}}
 function otherPointer(e){if(gesture&&(e.pointerType==='pen'||e.pointerId!==gesture.id))cancel();}
 function hidden(){if(root.hidden)cancel();}
 const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',interrupted],['lostpointercapture',interrupted]];
 listeners.forEach(([name,handler])=>canvas.addEventListener(name,handler,options));root.addEventListener?.('pointerdown',otherPointer,options);root.addEventListener?.('visibilitychange',hidden);
 return {cancel,hasGesture:()=>gesture!==null,dispose(){cancel();disposed=true;listeners.forEach(([name,handler])=>canvas.removeEventListener(name,handler,options));root.removeEventListener?.('pointerdown',otherPointer,options);root.removeEventListener?.('visibilitychange',hidden);}};
}
