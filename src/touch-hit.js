import {maxStrokeRadius} from './pen-renderer.js';
import {hitDrawingObject} from './drawing-objects.js';
const boxes=new WeakMap();
function bounds(s){if(boxes.has(s))return boxes.get(s);let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;for(const p of s.points||[]){x=Math.min(x,p.x);y=Math.min(y,p.y);r=Math.max(r,p.x);b=Math.max(b,p.y);}const out={x,y,r,b};boxes.set(s,out);return out;}
const nearSegment=(p,a,b,t)=>{const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy,u=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/n)):0;return Math.hypot(p.x-a.x-u*dx,p.y-a.y-u*dy)<=t;};
/** A swipe may begin only away from visible content; source ink is never mutated. */
export function blankPaperPoint(note,p,textTargets=[],padding=12){
 if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
 for(const t of textTargets){const b=t.bounds;if(b&&p.x>=b.x-padding&&p.x<=b.x+b.width+padding&&p.y>=b.y-padding&&p.y<=b.y+b.height+padding)return false;}
 for(const o of note.drawingObjects||[])if(hitDrawingObject(o,p,padding))return false;
 const covered=note.showOriginal?new Set():new Set(textTargets.flatMap(t=>t.strokeIds||[]));
 for(const s of note.strokes||[]){if(covered.has(s.id)||!s.points?.length)continue;const t=padding+maxStrokeRadius(s),b=bounds(s);if(p.x<b.x-t||p.x>b.r+t||p.y<b.y-t||p.y>b.b+t)continue;if(s.points.length===1){if(nearSegment(p,s.points[0],s.points[0],t))return false;}else for(let i=1;i<s.points.length;i++)if(nearSegment(p,s.points[i-1],s.points[i],t))return false;}
 return true;
}
