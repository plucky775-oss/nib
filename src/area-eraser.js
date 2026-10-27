/** Immutable centerline clipping against the swept circular eraser. Units: page coordinates. */
const EPS=1e-10;
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const length2=a=>dot(a,a);
const same=(a,b)=>a.x===b.x&&a.y===b.y;
function pointAt(a,b,t){
 if(t<=0)return {...a};if(t>=1)return {...b};
 const p={...a,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
 for(const key of ['pressure','time','timestamp'])if(Number.isFinite(a[key])&&Number.isFinite(b[key]))p[key]=a[key]+(b[key]-a[key])*t;
 return p;
}
function diskInterval(p,d,c,r){
 const q=sub(p,c),aa=length2(d),bb=dot(q,d),cc=length2(q)-r*r;
 if(aa===0)return cc<0?[0,1]:null;
 const disc=bb*bb-aa*cc;
 if(disc<=0)return null; // Tangential contact has zero erased length.
 const root=Math.sqrt(disc),lo=Math.max(0,(-bb-root)/aa),hi=Math.min(1,(-bb+root)/aa);
 return hi-lo>EPS?[lo,hi]:null;
}
function slab(interval,value,delta,low,high){
 if(delta===0)return value>low&&value<high?interval:null;
 let a=(low-value)/delta,b=(high-value)/delta;if(a>b)[a,b]=[b,a];
 const lo=Math.max(interval[0],a),hi=Math.min(interval[1],b);
 return hi-lo>EPS?[lo,hi]:null;
}
function erasedIntervals(p,q,a,b,r){
 const d=sub(q,p),v=sub(b,a),len=Math.hypot(v.x,v.y),intervals=[];
 for(const c of [a,b]){const i=diskInterval(p,d,c,r);if(i)intervals.push(i);}
 if(len>0){
 const u={x:v.x/len,y:v.y/len},n={x:-u.y,y:u.x},rel=sub(p,a);
 let i=slab([0,1],dot(rel,u),dot(d,u),0,len);
 if(i)i=slab(i,dot(rel,n),dot(d,n),-r,r);
 if(i)intervals.push(i);
 }
 intervals.sort((x,y)=>x[0]-y[0]);const merged=[];
 for(const i of intervals){const prev=merged.at(-1);if(prev&&i[0]<=prev[1]+EPS)prev[1]=Math.max(prev[1],i[1]);else merged.push([...i]);}
 return merged;
}
function pointInside(p,a,b,r){const v=sub(b,a),len=length2(v),t=len?Math.max(0,Math.min(1,dot(sub(p,a),v)/len)):0;return Math.hypot(p.x-a.x-v.x*t,p.y-a.y-v.y*t)<r;}
function clipPoints(points,a,b,r){
 if(points.length===1)return pointInside(points[0],a,b,r)?{changed:true,parts:[]}:{changed:false};
 let changed=false,current=[],parts=[];
 const finish=()=>{if(current.length)parts.push(current);current=[];};
 for(let j=1;j<points.length;j++){
 const p=points[j-1],q=points[j];
 if(same(p,q)){
 if(pointInside(p,a,b,r)){changed=true;finish();}else if(!current.length)current.push({...p});
 continue;
 }
 const removed=erasedIntervals(p,q,a,b,r);
 if(removed.length)changed=true;
 let start=0;
 for(const [lo,hi] of [...removed,[1,1]]){
 if(lo-start>EPS){
 const begin=pointAt(p,q,start),end=pointAt(p,q,lo);
 if(current.length&&!same(current.at(-1),begin))finish();
 if(!current.length)current.push(begin);
 if(!same(current.at(-1),end))current.push(end);
 }
 if(hi>lo)finish();
 start=hi;
 }
 }
 finish();return {changed,parts};
}
let counter=0;
const defaultId=()=>globalThis.crypto?.randomUUID?.()||`erase_${Date.now().toString(36)}_${(++counter).toString(36)}`;
/**
 * Invalid eraser coordinates or radius<=0 are a safe no-op. Invalid source data throws.
 * includeStrokeWidth adds half width to radius to keep round fragment caps clear of eraser.
 * removedIds includes ALL replaced originals (even those with surviving fragments).
 */
export function eraseStrokes(strokes,from,to=from,radius=20,{idFactory=defaultId,includeStrokeWidth=false}={}){
 if(!Array.isArray(strokes))throw new TypeError('strokes must be an array');
 const unchanged=()=>({strokes,changed:false,removedIds:[],replacements:[]});
 if(!validPoint(from)||!validPoint(to)||!Number.isFinite(radius)||radius<=0)return unchanged();
 if(typeof idFactory!=='function')throw new TypeError('idFactory must be a function');
 const used=new Set();
 for(const s of strokes){
 if(!s||typeof s.id!=='string'||used.has(s.id)||!Array.isArray(s.points)||!s.points.every(validPoint))throw new TypeError('Invalid stroke or duplicate stroke ID');
 used.add(s.id);
 }
 const result=[],removedIds=[],replacements=[];
 for(const stroke of strokes){
 const r=radius+(includeStrokeWidth&&Number.isFinite(stroke.width)&&stroke.width>0?stroke.width/2:0);
 const clipped=clipPoints(stroke.points,from,to,r);
 if(!clipped.changed){result.push(stroke);continue;}
 const fragmentIds=[];
 for(const points of clipped.parts){
 const id=idFactory();
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id)||used.has(id))throw new TypeError('idFactory must return unique safe IDs');
 used.add(id);fragmentIds.push(id);result.push({...stroke,id,points});
 }
 removedIds.push(stroke.id);replacements.push({sourceId:stroke.id,fragmentIds});
 }
 return removedIds.length?{strokes:result,changed:true,removedIds,replacements}:unchanged();
}
