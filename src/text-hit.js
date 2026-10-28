/** Hit-test durable object bounds supplied by the renderer.
 * Pass targets in paint order (bottom to top); provenance may be empty/missing.
 * This helper never changes strokes, source IDs, target objects, or note data.
 */
export function hitTestText(point,targets){
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Array.isArray(targets))return null;
 for(let i=targets.length-1;i>=0;i--){const target=targets[i],b=target?.bounds;
  if(!target||typeof target.groupId!=='string'||!target.groupId)continue;
  if(!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.width<=0||b.height<=0)continue;
  if(point.x>=b.x&&point.x<=b.x+b.width&&point.y>=b.y&&point.y<=b.y+b.height)return target;
 }
 return null;
}
/** Immediate single-finger dragging is separate from Pencil writing and lasso.
 * Contact sizes are CSS pixels per PointerEvent; missing/zero dimensions are
 * allowed because touch implementations may omit usable contact geometry.
 */
export function acceptDirectTouch(event,{activePointer=null,pan=false,mode,original=false,tool}={}){
 if(!event||event.pointerType!=='touch'||event.isPrimary===false)return false;
 if(activePointer!==null&&activePointer!==undefined)return false;
 if(pan||mode!=='text'||original||!['pen','select'].includes(tool))return false;
 if(event.button!==undefined&&event.button!==0)return false;
 for(const key of ['width','height'])if(event[key]!==undefined&&(!Number.isFinite(event[key])||event[key]<0||event[key]>40))return false;
 return true;
}
