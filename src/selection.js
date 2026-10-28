// Pure geometry. Call moveSelection against the drag-start note for each preview;
// the caller owns one undo entry, persistence and cancellation of recognition.
const PAGE={width:900,height:1200};
export function normalizeSelectionRect(rect){
 if(!rect||!['x','y','width','height'].every(k=>Number.isFinite(rect[k])))return null;
 return {x:Math.min(rect.x,rect.x+rect.width),y:Math.min(rect.y,rect.y+rect.height),width:Math.abs(rect.width),height:Math.abs(rect.height)};
}
const intersects=(a,b)=>a&&b&&a.x<=b.x+b.width&&a.x+a.width>=b.x&&a.y<=b.y+b.height&&a.y+a.height>=b.y;
function activeGroups(strokes,groups){const ids=new Set(strokes.map(s=>s.id));return (groups||[]).filter(g=>g&&g.strokeIds?.length&&g.strokeIds.every(id=>ids.has(id))&&normalizeSelectionRect(g.bounds));}
function segmentHits(a,b,r){
 // Slab intersection catches crossing segments even with both endpoints outside.
 let low=0,high=1;for(const [axis,size] of [['x','width'],['y','height']]){const delta=b[axis]-a[axis],min=r[axis],max=min+r[size];if(Math.abs(delta)<1e-12){if(a[axis]<min||a[axis]>max)return false;}else{let t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;if(t1>t2)[t1,t2]=[t2,t1];low=Math.max(low,t1);high=Math.min(high,t2);if(low>high)return false;}}return true;
}
function strokeHits(stroke,rect){const radius=Math.max(0,stroke.width||0)/2,r={x:rect.x-radius,y:rect.y-radius,width:rect.width+2*radius,height:rect.height+2*radius};const p=stroke.points||[];if(p.length===1)return segmentHits(p[0],p[0],r);return p.some((v,i)=>i>0&&segmentHits(p[i-1],v,r));}
export function expandSelection(strokes,groups,ids){
 const existing=new Set(strokes.map(s=>s.id)),selected=new Set([...ids].filter(id=>existing.has(id))),active=activeGroups(strokes,groups);let changed=true;
 while(changed){changed=false;for(const g of active)if(g.strokeIds.some(id=>selected.has(id)))for(const id of g.strokeIds)if(!selected.has(id)){selected.add(id);changed=true;}}
 return strokes.filter(s=>selected.has(s.id)).map(s=>s.id);
}
export function selectStrokesInRect(strokes,groups,rect,options={}){
 if(groups?.length&&options.groupPolicy!=='expand')return selectRegionDetailed(strokes,groups,rect,false).strokeIds;
 const r=normalizeSelectionRect(rect);if(!r)return [];
 const ids=new Set(strokes.filter(s=>strokeHits(s,r)).map(s=>s.id));
 for(const g of activeGroups(strokes,groups))if(intersects(r,g.bounds))g.strokeIds.forEach(id=>ids.add(id));
 return expandSelection(strokes,groups,ids);
}
export function selectionBounds(strokes,groups,ids){
 const selected=new Set(completeSelection(strokes,groups,ids));let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 const include=(x,y,x2,y2)=>{left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x2);bottom=Math.max(bottom,y2);};
 for(const s of strokes)if(selected.has(s.id)){const r=Math.max(0,s.width||0)/2;for(const p of s.points||[])include(p.x-r,p.y-r,p.x+r,p.y+r);}
 for(const g of activeGroups(strokes,groups))if(g.strokeIds.some(id=>selected.has(id))){const b=g.bounds;include(b.x,b.y,b.x+b.width,b.y+b.height);}
 if(!Number.isFinite(left))return null;
 // Ink already touching the paper edge may have a clipped round cap. Preserve
 // that existing clipping, but never allow a new translation farther off-page.
 left=Math.max(0,left);top=Math.max(0,top);right=Math.min(PAGE.width,right);bottom=Math.min(PAGE.height,bottom);
 return {x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
}
export function moveSelection(note,ids,dx,dy){
 const strokes=note.strokes||[],groups=note.convertedGroups||[],strokeIds=completeSelection(strokes,groups,ids),bounds=selectionBounds(strokes,groups,strokeIds);
 if(!bounds||!Number.isFinite(dx)||!Number.isFinite(dy))return {note,strokeIds,bounds,dx:0,dy:0,moved:false};
 dx=Math.max(-bounds.x,Math.min(PAGE.width-bounds.x-bounds.width,dx));dy=Math.max(-bounds.y,Math.min(PAGE.height-bounds.y-bounds.height,dy));
 if(!dx&&!dy)return {note,strokeIds,bounds,dx:0,dy:0,moved:false};
 const selected=new Set(strokeIds),active=new Set(activeGroups(strokes,groups));
 return {note:{...note,strokes:strokes.map(s=>selected.has(s.id)?{...s,points:s.points.map(p=>({...p,x:p.x+dx,y:p.y+dy}))}:s),convertedGroups:groups.map(g=>active.has(g)&&g.strokeIds.some(id=>selected.has(id))?{...g,bounds:{...g.bounds,x:g.bounds.x+dx,y:g.bounds.y+dy}}:g)},strokeIds,bounds:{...bounds,x:bounds.x+dx,y:bounds.y+dy},dx,dy,moved:true};
}

function polygonBounds(points){let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}return {x,y,width:right-x,height:bottom-y};}
function distanceToSegmentSquared(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return (p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;}
function pointInPolygon(p,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i];if(distanceToSegmentSquared(p,a,b)<1e-12)return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function segmentsCross(a,b,c,d){const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x),u=cross(a,b,c),v=cross(a,b,d),w=cross(c,d,a),z=cross(c,d,b);if(((u>0&&v<0)||(u<0&&v>0))&&((w>0&&z<0)||(w<0&&z>0)))return true;return distanceToSegmentSquared(a,c,d)<1e-12||distanceToSegmentSquared(b,c,d)<1e-12||distanceToSegmentSquared(c,a,b)<1e-12||distanceToSegmentSquared(d,a,b)<1e-12;}
function polygonHitsLine(a,b,polygon,radius=0){if(pointInPolygon(a,polygon)||pointInPolygon(b,polygon))return true;const radiusSquared=radius*radius;for(let i=0;i<polygon.length;i++){const c=polygon[i],d=polygon[(i+1)%polygon.length];if(segmentsCross(a,b,c,d))return true;if(radius>0&&Math.min(distanceToSegmentSquared(a,c,d),distanceToSegmentSquared(b,c,d),distanceToSegmentSquared(c,a,b),distanceToSegmentSquared(d,a,b))<=radiusSquared)return true;}return false;}
function polygonHitsBox(polygon,box){const corners=[{x:box.x,y:box.y},{x:box.x+box.width,y:box.y},{x:box.x+box.width,y:box.y+box.height},{x:box.x,y:box.y+box.height}];if(polygon.some(p=>p.x>=box.x&&p.x<=box.x+box.width&&p.y>=box.y&&p.y<=box.y+box.height))return true;return corners.some((p,i)=>polygonHitsLine(p,corners[(i+1)%4],polygon));}
/** Freehand lasso uses even-odd fill, including its automatically closed edge.
 * Stroke thickness and converted text rectangles are selectable. Input order,
 * raw coordinates and IDs are not modified; incomplete groups stay inactive.
 */
export function selectStrokesInLasso(strokes,groups,points,options={}){
 if(groups?.length&&options.groupPolicy!=='expand')return selectRegionDetailed(strokes,groups,points,true).strokeIds;
 if(!Array.isArray(points)||points.length<3||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return [];
 const bounds=polygonBounds(points),selected=new Set();
 // A collinear gesture is not an enclosing region; self-crossing lassos still
 // work (unlike signed-area rejection, which would discard a figure eight).
 const origin=points[0],other=points.find(p=>p.x!==origin.x||p.y!==origin.y);if(!other||!points.some(p=>Math.abs((other.x-origin.x)*(p.y-origin.y)-(other.y-origin.y)*(p.x-origin.x))>1e-8))return [];
 for(const stroke of strokes){const p=stroke.points||[];if(!p.length)continue;const radius=Math.max(0,stroke.width||0)/2,b=polygonBounds(p);b.x-=radius;b.y-=radius;b.width+=2*radius;b.height+=2*radius;if(!intersects(bounds,b))continue;if(p.length===1?polygonHitsLine(p[0],p[0],points,radius):p.some((v,i)=>i>0&&polygonHitsLine(p[i-1],v,points,radius)))selected.add(stroke.id);}
 for(const g of activeGroups(strokes,groups))if(intersects(bounds,g.bounds)&&polygonHitsBox(points,g.bounds))g.strokeIds.forEach(id=>selected.add(id));
 return expandSelection(strokes,groups,selected);
}

/** Strict region selection never silently pulls remote source ink into selection.
 * Converted text lacks reliable character-to-source mapping, so partial groups
 * are omitted and reported for UI explanation, not split or reinterpreted.
 * Explicit legacy expansion is available with {groupPolicy:'expand'} only.
 */
export function selectRegionDetailed(strokes,groups,region,lasso=true){
 const hit=lasso?selectStrokesInLasso(strokes,[],region):selectStrokesInRect(strokes,[],region);
 const r=lasso?null:normalizeSelectionRect(region),polygon=lasso?region:null;
 if(lasso&&(!Array.isArray(polygon)||polygon.length<3||polygon.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))))return {strokeIds:[],partialGroupIds:[]};
 if(!lasso&&!r)return {strokeIds:[],partialGroupIds:[]};
 const selected=new Set(hit),partial=new Set(),blocked=new Set(),active=activeGroups(strokes,groups);
 function containsBox(b){
  if(!lasso)return b.x>=r.x&&b.y>=r.y&&b.x+b.width<=r.x+r.width&&b.y+b.height<=r.y+r.height;
  const corners=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}];
  if(!corners.every(p=>pointInPolygon(p,polygon)))return false;
  const inner={x:b.x+1e-7,y:b.y+1e-7,width:Math.max(0,b.width-2e-7),height:Math.max(0,b.height-2e-7)};
  return !polygon.some((p,i)=>segmentHits(p,polygon[(i+1)%polygon.length],inner));
 }
 for(const g of active){
  // Include both rendered bounds and raw geometry: stale display bounds must
  // never authorize silently selecting source points elsewhere on the page.
  const source=strokes.filter(s=>g.strokeIds.includes(s.id));
  const fullBounds=selectionBounds(source,[],g.strokeIds);
  if(containsBox(g.bounds)&&(!fullBounds||containsBox(fullBounds))){g.strokeIds.forEach(id=>selected.add(id));continue;}
  const touches=g.strokeIds.some(id=>selected.has(id))||(lasso?polygonHitsBox(polygon,g.bounds):intersects(r,g.bounds));
  if(touches)partial.add(g.id);
  g.strokeIds.forEach(id=>blocked.add(id));
 }
 // Even malformed overlapping annotations cannot reintroduce partially selected
 // sources through an otherwise fully enclosed group.
 for(const id of blocked)selected.delete(id);
 let changed=true;while(changed){changed=false;for(const g of active)if(g.strokeIds.some(id=>selected.has(id))&&!g.strokeIds.every(id=>selected.has(id))){partial.add(g.id);for(const id of g.strokeIds)if(selected.delete(id))changed=true;}}
 return {strokeIds:strokes.filter(s=>selected.has(s.id)).map(s=>s.id),partialGroupIds:[...partial]};
}

/** Keep only explicitly selected complete groups; never grow a region later
 * during rendering or dragging. Raw strokes outside converted groups remain. */
export function completeSelection(strokes,groups,ids){
 const selected=new Set(ids),active=activeGroups(strokes,groups);let changed=true;
 while(changed){changed=false;for(const g of active)if(g.strokeIds.some(id=>selected.has(id))&&!g.strokeIds.every(id=>selected.has(id)))for(const id of g.strokeIds)if(selected.delete(id))changed=true;}
 return strokes.filter(s=>selected.has(s.id)).map(s=>s.id);
}
