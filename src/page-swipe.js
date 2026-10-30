/** Blank-paper, single-touch page navigation. No note writes or page creation. */
export function mountPageSwipe({canvas,getPageId,canStart,isBlank,navigate,beforeStart=()=>{},root=document,clock=Date.now,nativeTouch=!!canvas.ownerDocument?.defaultView?.TouchEvent,scrollByDelta=()=>{},scrollBy=scrollByDelta,canPan=canStart,beforePan=()=>{}}){
 let pan=null;const handledPanMoves=new WeakSet();
 let gesture=null,busy=false,disposed=false,nativeBlocked=false;const penPointers=new Set();const options={capture:true,passive:false};
 const consume=(e,block=false)=>{if(block&&e.cancelable!==false)e.preventDefault();e.stopImmediatePropagation();};
 function release(g){if(g.native)return;try{if(canvas.hasPointerCapture?.(g.id))canvas.releasePointerCapture(g.id)}catch{}}
 function cancel(){pan=null;const g=gesture;gesture=null;if(g)release(g);}
 const stableSize=g=>{const r=canvas.getBoundingClientRect();return r&&Number.isFinite(r.width)&&Number.isFinite(r.height)&&Math.abs(r.width-g.width)<=1&&Math.abs(r.height-g.height)<=1;};
 const allowed=()=>{try{return !disposed&&!busy&&canStart()===true}catch{return false}};
 function down(e){
  if(nativeTouch)return;
  if(gesture){if(e.pointerId!==gesture.id)cancel();return;}
  if(!allowed()||e.pointerType!=='touch'||e.isPrimary===false||e.button>0||e.width>40||e.height>40)return;
  const rect=canvas.getBoundingClientRect();if(!rect||!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||rect.width<=0||rect.height<=0)return;
  const x=(e.clientX-rect.left)*900/rect.width,y=(e.clientY-rect.top)*1200/rect.height;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>900||y>1200||!isBlank({x,y},e))return;
  const pageId=getPageId();if(pageId===undefined||pageId===null)return;
  beforeStart();if(!allowed()||getPageId()!==pageId)return;
  gesture={id:e.pointerId,pageId,x:e.clientX,y:e.clientY,startedAt:clock(),width:rect.width,height:rect.height,horizontal:false};
  consume(e);try{canvas.setPointerCapture(e.pointerId)}catch{cancel();}
 }
 function intent(x,y){if(!gesture)return false;const dx=x-gesture.x,dy=y-gesture.y;
  if(!allowed()||!stableSize(gesture)||getPageId()!==gesture.pageId||!Number.isFinite(dx)||!Number.isFinite(dy)||(Math.abs(dy)>=20&&Math.abs(dy)>Math.abs(dx))||Math.abs(dy)>60){cancel();return false;}
  gesture.horizontal=Math.abs(dx)>=10&&Math.abs(dx)>Math.abs(dy);return gesture.horizontal;
 }
 function move(e){if(nativeTouch)return;if(!gesture||e.pointerId!==gesture.id)return;const horizontal=intent(e.clientX,e.clientY);consume(e,horizontal);}
 // Touch-capable browsers use touchend as the only navigator. Pointer-only
 // fallback retains pointer swipe handling; the two paths never navigate together.
 function touchStart(e){
  if(!nativeTouch){if(gesture&&e.touches?.length>1)cancel();return;}
  if(e.touches?.length>1){globalTouchStart(e);return;}
  if(e.touches?.length!==1){if(gesture){cancel();nativeBlocked=true;}return;}
  if(gesture||nativeBlocked||penPointers.size||!allowed()||e.cancelable===false)return;
  const t=e.touches[0];if(t.touchType==='stylus'||(t.radiusX>40&&t.radiusY>40))return;
  const r=canvas.getBoundingClientRect();if(!r||!Number.isFinite(r.width)||!Number.isFinite(r.height)||r.width<=0||r.height<=0)return;
  const x=(t.clientX-r.left)*900/r.width,y=(t.clientY-r.top)*1200/r.height;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>900||y>1200||!isBlank({x,y},e))return;
  const pageId=getPageId();if(pageId==null)return;
  beforeStart();if(!allowed()||getPageId()!==pageId)return;
  gesture={native:true,id:t.identifier,pageId,x:t.clientX,y:t.clientY,lastY:t.clientY,startedAt:clock(),width:r.width,height:r.height,axis:null};
  e.preventDefault();
 }
 function nativeValid(){return gesture&&allowed()&&stableSize(gesture)&&getPageId()===gesture.pageId;}
 function nativeIntent(t){
  if(!nativeValid()){cancel();nativeBlocked=true;return false;}
  const dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)){cancel();nativeBlocked=true;return false;}
  if(!gesture.axis&&Math.max(Math.abs(dx),Math.abs(dy))>=12){
   if(Math.abs(dx)>=Math.abs(dy)*1.25)gesture.axis='horizontal';
   else if(Math.abs(dy)>Math.abs(dx)*1.25)gesture.axis='vertical';
  }

  return true;
 }
 function nativeMove(e){
  if(pan){panMove(e);return;}
  if(!gesture?.native)return;
  if(e.cancelable!==false)e.preventDefault();
  if(e.touches?.length!==1){cancel();nativeBlocked=true;return;}
  const t=Array.from(e.touches).find(t=>t.identifier===gesture.id);if(!t){cancel();nativeBlocked=true;return;}
  nativeIntent(t);
 }
 function touchEnd(e){
  if(!nativeTouch)return;
  if(pan){panEnd(e);return;}
  if(!gesture?.native){if(!e.touches?.length)nativeBlocked=false;return;}
  const t=Array.from(e.changedTouches||[]).find(t=>t.identifier===gesture.id);if(!t)return;
  if(e.cancelable!==false)e.preventDefault();
  if(!nativeIntent(t)){if(!e.touches?.length)nativeBlocked=false;return;}
  const g=gesture,dx=t.clientX-g.x,elapsed=clock()-g.startedAt;cancel();
  nativeBlocked=!!e.touches?.length;
  if(g.axis!=='horizontal'||elapsed<0||elapsed>3000||Math.abs(dx)<60||!allowed())return;
  performNavigate(dx<0?1:-1);
 }
 function touchCancel(e){if(!nativeTouch)return;cancel();nativeBlocked=!!e.touches?.length;}
 const panAllowed=()=>{try{return !disposed&&!busy&&!penPointers.size&&canPan()===true}catch{return false}};
 const onPaper=t=>t.target===canvas||!!canvas.contains?.(t.target);
 function pair(e){const ts=Array.from(e.touches||[]);if(ts.length!==2||ts.some(t=>!onPaper(t)||t.touchType==='stylus'||(t.radiusX>40&&t.radiusY>40)||!Number.isFinite(t.clientX)||!Number.isFinite(t.clientY)))return null;return ts;}
 function globalTouchStart(e){
  if(!nativeTouch||e.touches?.length<2)return;
  if(pan){if(e.touches.length!==2){cancel();nativeBlocked=true;}else consume(e,true);return;}
  const ts=pair(e),wasBlocked=nativeBlocked;
  cancel();
  if(wasBlocked||!ts||!panAllowed()||e.cancelable===false){nativeBlocked=true;return;}
  const r=canvas.getBoundingClientRect(),pageId=getPageId();
  if(pageId==null||!r||!Number.isFinite(r.width)||!Number.isFinite(r.height)||r.width<=0||r.height<=0){nativeBlocked=true;return;}
  beforePan();
  if(!panAllowed()||getPageId()!==pageId){nativeBlocked=true;return;}
  pan={ids:ts.map(t=>t.identifier),pageId,width:r.width,height:r.height,y:(ts[0].clientY+ts[1].clientY)/2,gap:Math.hypot(ts[0].clientX-ts[1].clientX,ts[0].clientY-ts[1].clientY)};
  nativeBlocked=true;consume(e,true);
 }
 function panMove(e){
  if(!pan||handledPanMoves.has(e))return;handledPanMoves.add(e);consume(e,true);
  const ts=pair(e);
  if(!ts||!panAllowed()||!stableSize(pan)||getPageId()!==pan.pageId||!ts.every(t=>pan.ids.includes(t.identifier))){cancel();nativeBlocked=true;return;}
  const gap=Math.hypot(ts[0].clientX-ts[1].clientX,ts[0].clientY-ts[1].clientY);
  if(Math.abs(gap-pan.gap)>Math.max(12,pan.gap*.15)){cancel();nativeBlocked=true;return;}
  const y=(ts[0].clientY+ts[1].clientY)/2,delta=pan.y-y;pan.y=y;
  if(delta){try{scrollBy(delta)}catch{cancel();nativeBlocked=true;}}
 }
 function panEnd(e){if(pan){consume(e,true);cancel();nativeBlocked=!!e.touches?.length;}else if(nativeTouch&&!e.touches?.length)nativeBlocked=false;}
 function rootTouchCancel(e){if(nativeTouch){cancel();nativeBlocked=!!e.touches?.length;}}
 function performNavigate(direction){busy=true;try{Promise.resolve(navigate(direction)).catch(()=>{}).finally(()=>{busy=false})}catch{busy=false;}}
 function touchMove(e){if(nativeTouch){nativeMove(e);return;}if(!gesture)return;if(e.touches?.length!==1){cancel();return;}const touch=e.touches[0];if(intent(touch.clientX,touch.clientY)&&e.cancelable!==false)e.preventDefault();}
 function up(e){if(nativeTouch)return;if(!gesture||e.pointerId!==gesture.id)return;consume(e,Math.abs(e.clientX-gesture.x)>=10&&Math.abs(e.clientX-gesture.x)>Math.abs(e.clientY-gesture.y));const g=gesture,dx=e.clientX-g.x,dy=e.clientY-g.y,elapsed=clock()-g.startedAt;cancel();if(!allowed()||!stableSize(g)||getPageId()!==g.pageId||!Number.isFinite(dx)||!Number.isFinite(dy)||elapsed<0||elapsed>1500||Math.abs(dx)<80||Math.abs(dx)<Math.abs(dy)*2||Math.abs(dy)>60)return;
  busy=true;try{Promise.resolve(navigate(dx<0?1:-1)).catch(()=>{}).finally(()=>{busy=false})}catch{busy=false;}
 }
 function interrupted(e){penPointers.delete(e.pointerId);if(nativeTouch)return;if(gesture&&e.pointerId===gesture.id){consume(e);cancel();}}
 function otherPointer(e){if(e.pointerType==='pen'){penPointers.add(e.pointerId);if(gesture||pan){cancel();if(nativeTouch)nativeBlocked=true;}}else if(!nativeTouch&&gesture&&e.pointerId!==gesture.id)cancel();}
 function pointerEnded(e){penPointers.delete(e.pointerId);}
 function hidden(){if(root.hidden){cancel();penPointers.clear();nativeBlocked=false;}}
 const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',interrupted],['lostpointercapture',interrupted],['touchstart',touchStart],['touchmove',touchMove],['touchend',touchEnd],['touchcancel',touchCancel]];
 listeners.forEach(([name,handler])=>canvas.addEventListener(name,handler,options));root.addEventListener?.('pointerdown',otherPointer,options);root.addEventListener?.('visibilitychange',hidden);root.addEventListener?.('touchstart',globalTouchStart,options);root.addEventListener?.('touchmove',panMove,options);root.addEventListener?.('touchend',panEnd,options);root.addEventListener?.('touchcancel',rootTouchCancel,options);root.addEventListener?.('pointerup',pointerEnded,options);root.addEventListener?.('pointercancel',pointerEnded,options);
 return {cancel,hasGesture:()=>gesture!==null||pan!==null,blocksNativeScroll:()=>pan!==null||gesture?.native===true||gesture?.horizontal===true,dispose(){cancel();disposed=true;listeners.forEach(([name,handler])=>canvas.removeEventListener(name,handler,options));root.removeEventListener?.('pointerdown',otherPointer,options);root.removeEventListener?.('visibilitychange',hidden);root.removeEventListener?.('touchstart',globalTouchStart,options);root.removeEventListener?.('touchmove',panMove,options);root.removeEventListener?.('touchend',panEnd,options);root.removeEventListener?.('touchcancel',rootTouchCancel,options);root.removeEventListener?.('pointerup',pointerEnded,options);root.removeEventListener?.('pointercancel',pointerEnded,options);}};
}

