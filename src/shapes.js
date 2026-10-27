/** Conservative, opt-in display-only shape cleanup. Units are notebook/page units.
 * Never use corrected points to replace source ink or as OCR input.
 */
const TAU = Math.PI * 2;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const copy = points => points.map(p => p && typeof p === 'object' ? {...p} : p);
function resample(points, count=96) {
  const lengths=[0];
  for(let i=1;i<points.length;i++) lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
  const total=lengths.at(-1), out=[]; let j=1;
  for(let k=0;k<count;k++) {
    const target=total*k/(count-1);
    while(j<points.length-1 && lengths[j]<target) j++;
    const t=(target-lengths[j-1])/(lengths[j]-lengths[j-1]||1);
    out.push({x:points[j-1].x+(points[j].x-points[j-1].x)*t,y:points[j-1].y+(points[j].y-points[j-1].y)*t});
  }
  return {points:out,length:total};
}
function circleFit(points) {
  const n=points.length, mx=points.reduce((s,p)=>s+p.x,0)/n,my=points.reduce((s,p)=>s+p.y,0)/n;
  let xx=0,xy=0,yy=0,xq=0,yq=0;
  for(const p of points){const x=p.x-mx,y=p.y-my,q=x*x+y*y;xx+=x*x;xy+=x*y;yy+=y*y;xq+=x*q;yq+=y*q;}
  const det=xx*yy-xy*xy;if(det<1e-9)return null;
  const cx=mx+(xq*yy-yq*xy)/(2*det),cy=my+(yq*xx-xq*xy)/(2*det);
  const radii=points.map(p=>Math.hypot(p.x-cx,p.y-cy)),radius=radii.reduce((a,b)=>a+b,0)/n;
  return {cx,cy,radius,rms:Math.sqrt(radii.reduce((s,r)=>s+(r-radius)**2,0)/n)/radius,max:Math.max(...radii.map(r=>Math.abs(r-radius)))/radius};
}
function crosses(a,b,c,d){
  const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  return orient(a,b,c)*orient(a,b,d)<-1e-8 && orient(c,d,a)*orient(c,d,b)<-1e-8;
}
function selfIntersects(points) {
  for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++) {
    if(i===0 && j===points.length-2)continue;
    if(crosses(points[i],points[i+1],points[j],points[j+1]))return true;
  }
  return false;
}
/** Returns fresh points and kind/reason; extra per-point fields (e.g. pressure) survive.
 * enabled defaults false. Thresholds assume Nib's 900 × 1200 page, NOT CSS pixels.
 * An ellipse, ambiguous loop or ordinary handwritten curve is intentionally unchanged.
 */
export function correctShape(input, options={}) {
  const source=Array.isArray(input)?input:[];
  const unchanged=reason=>({kind:'none',points:copy(source),reason});
  if(!options.enabled)return unchanged('disabled');
  if(source.length<2 || source.length>12000 || !source.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return unchanged('invalid-or-insufficient');
  const minLineLength=Number.isFinite(options.minLineLength)?Math.max(24,options.minLineLength):48;
  const minCircleDiameter=Number.isFinite(options.minCircleDiameter)?Math.max(40,options.minCircleDiameter):64;
  const points=source.filter((p,i)=>!i||distance(p,source[i-1])>1e-8);
  if(points.length<2)return unchanged('degenerate');
  const first=points[0],last=points.at(-1),chord=distance(first,last);
  const sampled=resample(points),samples=sampled.points;
  if(chord>=minLineLength && chord/sampled.length>=.95){
    const ux=(last.x-first.x)/chord,uy=(last.y-first.y)/chord;
    const errors=samples.map(p=>Math.abs((p.x-first.x)*uy-(p.y-first.y)*ux));
    const rms=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length);
    let previous=0,backtrack=0;
    for(const p of points){const t=(p.x-first.x)*ux+(p.y-first.y)*uy;backtrack+=Math.max(0,previous-t);previous=t;}
    if(Math.max(...errors)<=Math.max(.65,chord*.025) && rms<=Math.max(.35,chord*.012) && backtrack<=chord*.015){
      return {kind:'line',reason:'high-confidence-line',points:source.map((p,i)=>{
        if(i===0||i===source.length-1)return {...p};
        const t=Math.max(0,Math.min(chord,(p.x-first.x)*ux+(p.y-first.y)*uy));
        return {...p,x:first.x+t*ux,y:first.y+t*uy};
      })};
    }
  }
  if(points.length<16)return unchanged('not-a-circle');
  const xs=samples.map(p=>p.x),ys=samples.map(p=>p.y);
  const width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);
  if(Math.min(width,height)<minCircleDiameter || Math.min(width,height)/Math.max(width,height)<.86)return unchanged('small-or-nonround');
  const exactFit=circleFit(points);
  const fit=exactFit && exactFit.rms<1e-8 ? exactFit : circleFit(samples);if(!fit)return unchanged('degenerate');
  const {cx,cy,radius}=fit;
  if(chord>radius*.18 || fit.rms>.035 || fit.max>.09)return unchanged('open-or-noncircular');
  let angle=0,backward=0;const deltas=[];
  for(let i=1;i<points.length;i++){
    let d=Math.atan2(points[i].y-cy,points[i].x-cx)-Math.atan2(points[i-1].y-cy,points[i-1].x-cx);
    d=Math.atan2(Math.sin(d),Math.cos(d));deltas.push(d);angle+=d;
  }
  const direction=Math.sign(angle);
  for(const d of deltas)if(d*direction<0)backward-=d*direction;
  if(Math.abs(Math.abs(angle)-TAU)>.22 || backward>.08 || Math.max(...deltas.map(Math.abs))>.6 || selfIntersects(samples))return unchanged('ambiguous-loop');
  const corrected=source.map(p=>{const a=Math.atan2(p.y-cy,p.x-cx);return {...p,x:cx+radius*Math.cos(a),y:cy+radius*Math.sin(a)};});
  corrected.at(-1).x=corrected[0].x;corrected.at(-1).y=corrected[0].y;
  return {kind:'circle',reason:'high-confidence-circle',points:corrected};
}
