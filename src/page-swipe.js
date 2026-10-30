/** Observe two-finger paper translation without cancelling native pinch zoom. */
export function mountPageSwipe({canvas,getPageId,canStart,beforeStart=()=>{},navigate,root=document,clock=Date.now}){
 let gesture=null,blocked=false,busy=false,disposed=false;const pens=new Set(),seen=new WeakSet();
 const options={capture:true,passive:true};
 const viewport=canvas.ownerDocument?.defaultView?.visualViewport;
 const scale=()=>Number.isFinite(viewport?.scale)?viewport.scale:1;
 const allowed=()=>{try{return !disposed&&!busy&&!pens.size&&!root.hidden&&canStart()===true}catch{return false}};
 const onPaper=t=>t.target===canvas||!!canvas.contains?.(t.target);
 const point=t=>({x:t.clientX,y:t.clientY});
 const valid=t=>Number.isFinite(t.clientX)&&Number.isFinite(t.clientY)&&t.touchType!=='stylus'&&!(t.radiusX>40&&t.radiusY>40);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function cancel(){if(gesture)blocked=true;gesture=null;}
 function context(){const r=canvas.getBoundingClientRect();return allowed()&&getPageId()===gesture.pageId&&Math.abs(scale()-gesture.scale)<.001&&Number.isFinite(r.width)&&Number.isFinite(r.height)&&Math.abs(r.width-gesture.width)<=1&&Math.abs(r.height-gesture.height)<=1;}
 function examine(){
  if(!gesture)return false;if(!context()){cancel();return false;}
  const g=gesture,[a,b]=g.current,[sa,sb]=g.start;
  const gap=distance(a,b),vx=b.x-a.x,vy=b.y-a.y,sx=sb.x-sa.x,sy=sb.y-sa.y;
  const angle=Math.abs(Math.atan2(sx*vy-sy*vx,sx*vx+sy*vy));
  const da={x:a.x-sa.x,y:a.y-sa.y},db={x:b.x-sb.x,y:b.y-sb.y};
  const opposed=Math.hypot(da.x,da.y)>=8&&Math.hypot(db.x,db.y)>=8&&da.x*db.x+da.y*db.y<0;
  if(Math.abs(gap-g.gap)>Math.max(8,g.gap*.08)||angle>Math.PI/24||opposed){cancel();return false;}
  return true;
 }
 function update(touches){if(!gesture)return;for(const t of Array.from(touches||[])){const i=gesture.ids.indexOf(t.identifier);if(i<0||gesture.ended.has(t.identifier))continue;if(!valid(t)){cancel();return;}gesture.current[i]=point(t);}examine();}
 function start(e){
  const ts=Array.from(e.touches||[]);if(ts.length<2)return;
  if(gesture){cancel();return;}if(blocked)return;
  if(ts.length!==2||!allowed()||ts.some(t=>!valid(t)||!onPaper(t))||ts[0].identifier===ts[1].identifier){blocked=true;return;}
  const r=canvas.getBoundingClientRect(),pageId=getPageId(),points=ts.map(point),gap=distance(...points);
  if(pageId==null||!Number.isFinite(r.width)||!Number.isFinite(r.height)||r.width<=0||r.height<=0||gap<8){blocked=true;return;}
  beforeStart();if(!allowed()||getPageId()!==pageId){blocked=true;return;}
  blocked=false;gesture={ids:ts.map(t=>t.identifier),start:points,current:points.map(p=>({...p})),gap,pageId,width:r.width,height:r.height,scale:scale(),startedAt:clock(),ended:new Set()};
 }
 function move(e){if(!gesture)return;const ts=Array.from(e.touches||[]);if(ts.length!==2-gesture.ended.size||ts.some(t=>!gesture.ids.includes(t.identifier)||gesture.ended.has(t.identifier))){cancel();return;}update(ts);}
 function end(e){
  if(!gesture){if(!e.touches?.length)blocked=false;return;}
  update([...Array.from(e.changedTouches||[]),...Array.from(e.touches||[])]);
  if(!gesture){if(!e.touches?.length)blocked=false;return;}
  for(const t of Array.from(e.changedTouches||[])){if(gesture.ids.includes(t.identifier))gesture.ended.add(t.identifier);else{cancel();break;}}
  if(e.touches?.length)return;
  const g=gesture;gesture=null;blocked=false;if(!g||g.ended.size!==2||!allowed())return;
  const dxs=g.current.map((p,i)=>p.x-g.start[i].x),dys=g.current.map((p,i)=>p.y-g.start[i].y);
  const dx=(dxs[0]+dxs[1])/2,dy=(dys[0]+dys[1])/2,elapsed=clock()-g.startedAt;
  if(elapsed<0||elapsed>3000||Math.abs(dx)<80||Math.abs(dx)<1.5*Math.abs(dy)||dxs[0]*dxs[1]<=0||dxs.some(x=>Math.abs(x)<24)||Math.abs(distance(...g.current)-g.gap)>g.gap*.05)return;
  busy=true;try{Promise.resolve(navigate(dx<0?1:-1)).catch(()=>{}).finally(()=>{busy=false})}catch{busy=false;}
 }
 function touchCancel(e){cancel();blocked=!!e.touches?.length;}
 function penDown(e){if(e.pointerType==='pen'){pens.add(e.pointerId);cancel();}}
 function penEnd(e){pens.delete(e.pointerId);}
 function pointerCancel(e){penEnd(e);/* TouchEvents own navigation; only touchcancel ends their stream. */}
 function hidden(){if(root.hidden){cancel();pens.clear();}}
 function scaleChanged(){if(gesture&&Math.abs(scale()-gesture.scale)>=.001)cancel();}
 const handlers=[['touchstart',start],['touchmove',move],['touchend',end],['touchcancel',touchCancel]].map(([name,fn])=>[name,e=>{if(seen.has(e))return;seen.add(e);fn(e);}]);
 for(const [name,fn]of handlers){canvas.addEventListener(name,fn,options);root.addEventListener?.(name,fn,options);}
 root.addEventListener?.('pointerdown',penDown,options);root.addEventListener?.('pointerup',penEnd,options);root.addEventListener?.('pointercancel',pointerCancel,options);root.addEventListener?.('visibilitychange',hidden);viewport?.addEventListener?.('resize',scaleChanged);
 return {cancel,hasGesture:()=>!!gesture,blocksNativeScroll:()=>false,dispose(){cancel();disposed=true;for(const [name,fn]of handlers){canvas.removeEventListener(name,fn,options);root.removeEventListener?.(name,fn,options);}root.removeEventListener?.('pointerdown',penDown,options);root.removeEventListener?.('pointerup',penEnd,options);root.removeEventListener?.('pointercancel',pointerCancel,options);root.removeEventListener?.('visibilitychange',hidden);viewport?.removeEventListener?.('resize',scaleChanged);}};
}
