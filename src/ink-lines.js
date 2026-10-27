/** Geometry-only row estimates. Never changes strokes or recognizes characters. */
const W=900,H=1200;
export function deriveInkRows(strokes,{gap=4,padding=2}={}){
 const boxes=[];let malformed=false;
 for(const s of Array.isArray(strokes)?strokes:[]){
  if(!s||!Array.isArray(s.points)||!s.points.length){malformed=true;continue;}
  const radius=Number.isFinite(s.width)?Math.max(0,Math.min(15,s.width))/2:1.5;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const p of s.points){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){malformed=true;continue;}left=Math.min(left,p.x-radius);right=Math.max(right,p.x+radius);top=Math.min(top,p.y-radius);bottom=Math.max(bottom,p.y+radius);}
  if(!Number.isFinite(left))continue;
  boxes.push({left:Math.max(0,Math.min(W,left)),right:Math.max(0,Math.min(W,right)),top:Math.max(0,Math.min(H,top)),bottom:Math.max(0,Math.min(H,bottom)),strokeIds:typeof s.id==='string'?[s.id]:[]});
 }
 boxes.sort((a,b)=>a.top-b.top||a.left-b.left);
 const bands=[],threshold=Number.isFinite(gap)?Math.max(0,Math.min(20,gap)):4;
 for(const box of boxes){const last=bands.at(-1);if(last&&box.top<=last.bottom+threshold){last.left=Math.min(last.left,box.left);last.right=Math.max(last.right,box.right);last.bottom=Math.max(last.bottom,box.bottom);last.strokeIds.push(...box.strokeIds);}else bands.push({...box,strokeIds:[...box.strokeIds]});}
 const pad=Number.isFinite(padding)?Math.max(0,Math.min(10,padding)):2;
 const rows=bands.map((b,i)=>{const left=Math.max(0,b.left-pad),right=Math.min(W,b.right+pad);const top=Math.max(0,b.top-pad,i?(bands[i-1].bottom+b.top)/2:0);const bottom=Math.min(H,b.bottom+pad,i+1<bands.length?(b.bottom+bands[i+1].top)/2:H);return {bounds:{x:left,y:top,width:Math.max(.01,right-left),height:Math.max(.01,bottom-top)},strokeIds:[...new Set(b.strokeIds)]};});
 return {rows,ambiguous:malformed||bands.some(b=>b.bottom-b.top>120)||(bands.length>1&&bands.some(b=>b.bottom-b.top<5))};
}
/** Split only existing text, in its original order. sourceText pieces concatenate
 * exactly to the supplied text. text omits an existing final line separator for
 * rendering only. Proportional splitting is layout, NOT character alignment/OCR.
 */
export function distributeTextAcrossRows(text,rows,{measure}={}){
 if(typeof text!=='string')throw Error('Text must be a string');
 if(!Array.isArray(rows)||!rows.length)return {rows:[],unplacedText:text,strategy:'no-rows',ambiguous:!!text};
 const sourceRows=rows.map(r=>({...r,bounds:{...r.bounds}}));
 const make=(r,start,end)=>({...r,start,end,sourceText:text.slice(start,end),text:text.slice(start,end).replace(/\r?\n$/,'')});
 if(rows.length===1)return {rows:[make(sourceRows[0],0,text.length)],unplacedText:'',strategy:'single-row',ambiguous:false};
 const breaks=[...text.matchAll(/\n/g)].map(m=>m.index+1);
 if(breaks.length===rows.length-1){const cuts=[0,...breaks,text.length];return {rows:sourceRows.map((r,i)=>make(r,cuts[i],cuts[i+1])),unplacedText:'',strategy:'explicit-lines',ambiguous:false};}
 const chars=Array.from(text),offsets=[0],weights=[];
 for(const ch of chars){offsets.push(offsets.at(-1)+ch.length);const measured=measure?.(ch);weights.push(Number.isFinite(measured)&&measured>=0?measured:/\s/.test(ch)?.45:/[\x00-\x7f]/.test(ch)?.65:1);}
 const total=weights.reduce((a,b)=>a+b,0),capacity=sourceRows.map(r=>Number.isFinite(r.bounds.width)?Math.max(.01,r.bounds.width):1),totalCapacity=capacity.reduce((a,b)=>a+b,0);
 const cuts=[0];let consumed=0,cumulativeCapacity=0,index=0;
 for(let row=0;row<rows.length-1;row++){
  cumulativeCapacity+=capacity[row];const target=total*cumulativeCapacity/totalCapacity;
  while(index<chars.length&&consumed+weights[index]/2<target){consumed+=weights[index++];}
  // Prefer a nearby existing word boundary, but never create/drop characters.
  const min=cuts.at(-1),max=chars.length;let boundary=index,best=Infinity;
  for(let k=Math.max(min,index-3);k<=Math.min(max,index+3);k++){if(k>min&&/\s/.test(chars[k-1])&&Math.abs(k-index)<best){boundary=k;best=Math.abs(k-index);}}
  index=Math.max(min,boundary);consumed=weights.slice(0,index).reduce((a,b)=>a+b,0);cuts.push(index);
 }
 cuts.push(chars.length);
 return {rows:sourceRows.map((r,i)=>make(r,offsets[cuts[i]],offsets[cuts[i+1]])),unplacedText:'',strategy:'proportional',ambiguous:true};
}
