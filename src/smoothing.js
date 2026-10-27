/** Spatial handwriting denoising, not character recognition or layout correction.
 * Returns the same number of points and preserves all per-point metadata.
 * Call on original points, never repeatedly on previously smoothed output.
 */
export function smoothHandwriting(points, amount = .55) {
  const copy = points.map(p => ({...p}));
  const a = Number.isFinite(amount) ? Math.max(0, Math.min(.85, amount)) : 0;
  if (points.length < 3 || !a || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return copy;
  const distances = [0];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (let i=0;i<points.length;i++) {
    const p=points[i]; minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    if(i) distances.push(distances[i-1]+Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y));
  }
  const length=distances.at(-1),extent=Math.max(maxX-minX,maxY-minY);
  if(length<2 || extent<1) return copy;
  // Bounded work even for pathological imported strokes. Normal Pencil paths
  // use a 1.5 page-unit step, independent of event frequency or writing speed.
  const count=Math.max(2,Math.min(16000,Math.ceil(length/1.5))), step=length/count;
  const samples=[];let segment=1;
  for(let i=0;i<=count;i++) {
    const s=i*step;
    while(segment<points.length-1 && distances[segment]<s)segment++;
    const t=(s-distances[segment-1])/(distances[segment]-distances[segment-1]||1);
    samples.push({x:points[segment-1].x+(points[segment].x-points[segment-1].x)*t,y:points[segment-1].y+(points[segment].y-points[segment-1].y)*t});
  }
  const sigma=Math.min(10,Math.max(2.5,extent*.075))*(.55+a);
  const reach=Math.min(60,Math.ceil(sigma*2.5/step));
  const cornerSpan=Math.max(1,Math.round(Math.min(8,Math.max(3,extent*.07))/step));
  const cap=Math.min(5,extent*.065)*a/.85;
  const guide=samples.map((p,i)=> {
    const r=Math.max(1,Math.round(2/step));let x=0,y=0,n=0;
    for(let j=Math.max(0,i-r);j<=Math.min(count,i+r);j++){x+=samples[j].x;y+=samples[j].y;n++;}
    return {x:x/n,y:y/n};
  });
  const filtered=samples.map((p,i)=> {
    if(i===0||i===count)return p;
    const left=guide[Math.max(0,i-2*cornerSpan)],leftInner=guide[Math.max(0,i-cornerSpan)];
    const right=guide[Math.min(count,i+2*cornerSpan)],rightInner=guide[Math.min(count,i+cornerSpan)];
    const ux=leftInner.x-left.x,uy=leftInner.y-left.y,vx=right.x-rightInner.x,vy=right.y-rightInner.y;
    const denom=Math.hypot(ux,uy)*Math.hypot(vx,vy);
    const turn=denom>1e-8?Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/denom))):Math.PI;
    const corner=Math.max(0,Math.min(1,(turn-.55)/.8));
    // Local linear regression avoids pulling near-end points along the stroke.
    let w0=0,w1=0,w2=0,x0=0,x1=0,y0=0,y1=0;
    for(let j=Math.max(0,i-reach);j<=Math.min(count,i+reach);j++) {
      const d=(j-i)*step,w=Math.exp(-.5*(d/sigma)**2),q=samples[j];
      w0+=w;w1+=w*d;w2+=w*d*d;x0+=w*q.x;x1+=w*d*q.x;y0+=w*q.y;y1+=w*d*q.y;
    }
    const det=w0*w2-w1*w1;
    if(det<1e-8)return p;
    const blend=(a/.85)*(1-corner)*Math.min(1,i*step/3,(count-i)*step/3);
    let dx=((x0*w2-x1*w1)/det-p.x)*blend,dy=((y0*w2-y1*w1)/det-p.y)*blend;
    const move=Math.hypot(dx,dy);if(move>cap){dx*=cap/move;dy*=cap/move;}
    return {x:p.x+dx,y:p.y+dy};
  });
  return copy.map((p,i)=> {
    if(i===0||i===points.length-1)return p;
    const pos=distances[i]/step,index=Math.min(count-1,Math.floor(pos)),t=pos-index;
    const x=filtered[index].x+(filtered[index+1].x-filtered[index].x)*t;
    const y=filtered[index].y+(filtered[index+1].y-filtered[index].y)*t;
    let dx=x-p.x,dy=y-p.y;const move=Math.hypot(dx,dy);
    if(move>cap){dx*=cap/move;dy*=cap/move;}
    return {...p,x:Math.max(minX,Math.min(maxX,p.x+dx)),y:Math.max(minY,Math.min(maxY,p.y+dy))};
  });
}
