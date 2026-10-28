export const PEN_KINDS=Object.freeze([
 {id:'pencil',label:'연필'},{id:'fountain',label:'만년필'},{id:'ballpoint',label:'볼펜'},
 {id:'highlighter',label:'형광펜'},{id:'marker',label:'사인펜'},{id:'colored-pencil',label:'색연필'}
].map(Object.freeze));
export function normalizePenKind(id){return PEN_KINDS.some(p=>p.id===id)?id:'legacy';}
const LIMIT=2048,GRAIN_LIMIT=1600;
const widthOf=s=>Number.isFinite(s?.width)?Math.max(1,Math.min(15,s.width)):3;
const pressure=p=>Number.isFinite(p?.pressure)?Math.max(0,Math.min(1,p.pressure)):.5;
function factor(kind,p){switch(kind){case'fountain':return .25+1.85*p;case'ballpoint':return .8+.4*p;case'marker':return .65+.85*p;case'highlighter':return 3;case'pencil':case'colored-pencil':return .45+1.1*p;default:return 1;}}
export function maxStrokeRadius(stroke){return widthOf(stroke)*factor(normalizePenKind(stroke?.penKind),1)/2;}
const round=n=>Math.round(n*1000)/1000;
const point=(x,y)=>[round(x),round(y)];
function disc(x,y,r,steps=10){return Array.from({length:steps},(_,i)=>point(x+Math.cos(i*Math.PI*2/steps)*r,y+Math.sin(i*Math.PI*2/steps)*r));}
function hash(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0;}
function random(seed){let x=seed||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
/** Deterministic bounded display geometry. Raw samples are never mutated.
 * Each layer is one nonzero compound fill: self crossings within a highlighter
 * stroke do not multiply alpha. Separate highlighter strokes do accumulate.
 * Samples above 2048 are evenly reduced only for display, including endpoints.
 */
export function strokeGeometry(stroke,points=stroke?.points){
 const valid=(Array.isArray(points)?points:[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=900&&p.y>=0&&p.y<=1200);
 if(!valid.length)return [];
 const samples=valid.length<=LIMIT?valid:Array.from({length:LIMIT},(_,i)=>valid[Math.round(i*(valid.length-1)/(LIMIT-1))]);
 const kind=normalizePenKind(stroke?.penKind),width=widthOf(stroke),color=typeof stroke?.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(stroke.color)?stroke.color:'#223247';
 if(kind==='legacy')return [{type:'stroke',color,opacity:1,width,points:valid.map(p=>({x:p.x,y:p.y}))}];
 const grainy=kind==='pencil'||kind==='colored-pencil';const polygons=[],segments=[];
 for(let i=0;i<samples.length;i++){
  const a=samples[i],r=width*factor(kind,pressure(a))/2;polygons.push(disc(a.x,a.y,r));
  if(i+1<samples.length){const b=samples[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;const nx=-dy/len,ny=dx/len,rb=width*factor(kind,pressure(b))/2;
   polygons.push([point(a.x-nx*r,a.y-ny*r),point(b.x-nx*rb,b.y-ny*rb),point(b.x+nx*rb,b.y+ny*rb),point(a.x+nx*r,a.y+ny*r)]);segments.push({a,b,len,r,rb,nx,ny});}
 }
 const layers=[{color,opacity:kind==='highlighter'?.32:grainy?(kind==='pencil'?.11:.14):1,polygons}];
 if(grainy){
  const total=segments.reduce((sum,s)=>sum+s.len,0),count=Math.min(GRAIN_LIMIT,Math.max(12,Math.ceil(total*(kind==='colored-pencil'?1.6:1.05)))),grain=[];
  let index=0,offset=0;const seed=hash(String(stroke?.id||'').slice(0,100));
  for(let i=0;i<count;i++){
   const distance=total*(i+.5)/count;while(index<segments.length-1&&offset+segments[index].len<distance){offset+=segments[index].len;index++;}
   const seg=segments[index],t=seg?Math.max(0,Math.min(1,(distance-offset)/seg.len)):0,a=seg?.a||samples[0],b=seg?.b||a;
   const cx=a.x+(b.x-a.x)*t,cy=a.y+(b.y-a.y)*t,r=seg?seg.r+(seg.rb-seg.r)*t:width*factor(kind,pressure(a))/2;
   const rng=random(seed^hash(`${round(cx)},${round(cy)},${i}`)),angle=rng()*Math.PI*2,grainRadius=Math.min(r*.8,Math.max(.22,Math.min(.9,width*.13))*(.8+rng()*.4)),radial=Math.sqrt(rng())*Math.max(0,r-grainRadius);
   grain.push(disc(cx+Math.cos(angle)*radial,cy+Math.sin(angle)*radial,grainRadius,5));
  }
  layers.push({color,opacity:kind==='colored-pencil'?.84:.9,polygons:grain});
 }
 return layers;
}
function legacyPath(points){if(points.length===1)return `M${points[0].x} ${points[0].y}l0.01 0`;return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');}
function pathData(polygons){return polygons.map(p=>'M'+p.map(v=>v.join(' ')).join('L')+'Z').join('');}
export function strokeSvg(stroke,points=stroke?.points){return strokeGeometry(stroke,points).map(layer=>layer.type==='stroke'?`<path d="${legacyPath(layer.points)}" fill="none" stroke="${layer.color}" stroke-width="${layer.width}" stroke-linecap="round" stroke-linejoin="round"/>`:`<path d="${pathData(layer.polygons)}" fill="${layer.color}" fill-opacity="${layer.opacity}" fill-rule="nonzero"/>`).join('');}
export function drawStyledStroke(ctx,stroke,points=stroke?.points){ctx.save();try{ctx.globalCompositeOperation='source-over';for(const layer of strokeGeometry(stroke,points)){ctx.fillStyle=layer.color;ctx.globalAlpha=layer.opacity;ctx.beginPath();if(layer.type==='stroke'){ctx.strokeStyle=layer.color;ctx.lineWidth=layer.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash?.([]);layer.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(layer.points.length===1)ctx.lineTo(layer.points[0].x+.01,layer.points[0].y);ctx.stroke();continue;}for(const polygon of layer.polygons){ctx.moveTo(...polygon[0]);for(let i=1;i<polygon.length;i++)ctx.lineTo(...polygon[i]);ctx.closePath();}ctx.fill('nonzero');}}finally{ctx.restore();}}
