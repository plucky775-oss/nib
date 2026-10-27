// An unfinished letter may receive new strokes inside an already converted area.
// Re-read the affected original ink together instead of stacking a second text layer.
export function selectRecognitionStrokes(strokes,groups,{incremental=true}={}){
 if(!incremental)return {strokes:[...strokes],revisited:false};
 const covered=new Set(groups.flatMap(g=>g.strokeIds));const selected=new Set(strokes.filter(s=>!covered.has(s.id)).map(s=>s.id));if(!selected.size)return {strokes:[],revisited:false};
 const boxes=new Map(strokes.map(s=>{let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const p of s.points){x=Math.min(x,p.x-s.width/2);y=Math.min(y,p.y-s.width/2);right=Math.max(right,p.x+s.width/2);bottom=Math.max(bottom,p.y+s.width/2)}return [s.id,{x,y,width:right-x,height:bottom-y}]}));
 const intersects=(a,b)=>a.x<=b.x+b.width+1&&a.x+a.width+1>=b.x&&a.y<=b.y+b.height+1&&a.y+a.height+1>=b.y;
 let changed=true,revisited=false;
 while(changed){changed=false;for(const g of groups){if(g.strokeIds.every(id=>selected.has(id)))continue;if([...selected].some(id=>intersects(boxes.get(id),g.bounds))){g.strokeIds.forEach(id=>selected.add(id));changed=true;revisited=true;}}}
 return {strokes:strokes.filter(s=>selected.has(s.id)),revisited};
}
