const PAGE={width:900,height:1200};
/** Immutable drag-start preview. A conversion is ONE durable multiline object.
 * Missing provenance never invalidates it; only existing source ink is moved.
 */
export function moveTextObject(note,objectId,dx,dy){
 const groups=note.convertedGroups||[],object=groups.find(g=>g.id===objectId),b=object?.bounds;
 const valid=b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=PAGE.width&&b.y+b.height<=PAGE.height;
 if(!valid||!Number.isFinite(dx)||!Number.isFinite(dy))return {note,moved:false,dx:0,dy:0,bounds:valid?{...b}:null};
 const sources=new Set(Array.isArray(object.strokeIds)?object.strokeIds:[]),strokes=note.strokes||[];
 let left=b.x,top=b.y,right=b.x+b.width,bottom=b.y+b.height;
 for(const s of strokes)if(sources.has(s.id)){const radius=Number.isFinite(s.width)?Math.max(0,s.width)/2:0;for(const p of s.points||[]){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>900||p.y>1200)return {note,moved:false,dx:0,dy:0,bounds:{...b}};left=Math.min(left,Math.max(0,p.x-radius));top=Math.min(top,Math.max(0,p.y-radius));right=Math.max(right,Math.min(PAGE.width,p.x+radius));bottom=Math.max(bottom,Math.min(PAGE.height,p.y+radius));}}
 dx=Math.max(-left,Math.min(PAGE.width-right,dx));dy=Math.max(-top,Math.min(PAGE.height-bottom,dy));
 if(!dx&&!dy)return {note,moved:false,dx:0,dy:0,bounds:{...b}};
 const bounds={...b,x:b.x+dx,y:b.y+dy};
 return {note:{...note,strokes:strokes.map(s=>sources.has(s.id)?{...s,points:s.points.map(p=>({...p,x:p.x+dx,y:p.y+dy}))}:s),convertedGroups:groups.map(g=>g===object?{...g,bounds}:g)},moved:true,dx,dy,bounds};
}
