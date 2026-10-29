const W=900,H=1200,TYPES=['line','arrow','rectangle','ellipse','triangle','diamond','table'];
const FONTS=['NanumPenScript','NanumBrushScript','Gaegu','GamjaFlower','PoorStory'];
const safeId=v=>typeof v==='string'&&v.length>0&&v.length<=100&&!/[^a-zA-Z0-9_-]/.test(v);
const color=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)&&v.length===7;
const font=v=>FONTS.includes(v)||(typeof v==='string'&&/^custom_[a-f0-9]{64}$/.test(v)&&v.length===71);
const fail=()=>{throw Error('도형 정보 또는 크기가 올바르지 않습니다.');};
export const DRAWING_TYPES=Object.freeze([...TYPES]);
export function validateDrawingObjects(input=[]){
 if(!Array.isArray(input)||input.length>200)fail();const ids=new Set();let pageText=0;
 return input.map(o=>{const b=o?.bounds;if(!o||!safeId(o.id)||ids.has(o.id)||!TYPES.includes(o.type)||!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>W||b.y+b.height>H)fail();
 if(!color(o.color)||!Number.isFinite(o.width)||o.width<1||o.width>15||!(o.fill==='none'||color(o.fill))||typeof o.text!=='string'||o.text.length>2000||!font(o.font)||![24,32,40].includes(o.fontSize))fail();
 if(o.reverse!==undefined&&typeof o.reverse!=='boolean'||o.flipY!==undefined&&typeof o.flipY!=='boolean')fail();
 ids.add(o.id);const out={id:o.id,type:o.type,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},color:o.color,width:o.width,fill:o.fill,text:o.text,font:o.font,fontSize:o.fontSize,reverse:o.reverse===true,flipY:o.flipY===true};
 if(o.type==='table'){if(!Number.isInteger(o.rows)||o.rows<1||o.rows>8||!Number.isInteger(o.cols)||o.cols<1||o.cols>8||!Array.isArray(o.cells)||o.cells.length!==o.rows)fail();let total=0;out.rows=o.rows;out.cols=o.cols;out.cells=o.cells.map(row=>{if(!Array.isArray(row)||row.length!==o.cols)fail();return row.map(text=>{if(typeof text!=='string'||text.length>2000)fail();total+=text.length;return text})});if(total>8000)fail();}
 pageText+=out.text.length+(out.cells||[]).flat().reduce((n,t)=>n+t.length,0);if(pageText>50000)throw Error('이 페이지의 그림 글이 너무 많습니다. 새 페이지를 사용해주세요.');
 return out;
 });
}
export function createDrawingObject(type,from,to,style={}){
 if(!from||!to||![from.x,from.y,to.x,to.y].every(Number.isFinite))fail();
 const x=Math.min(899,Math.max(0,Math.min(from.x,to.x))),y=Math.min(1199,Math.max(0,Math.min(from.y,to.y)));
 const bounds={x,y,width:Math.max(1,Math.min(W-x,Math.abs(to.x-from.x))),height:Math.max(1,Math.min(H-y,Math.abs(to.y-from.y)))};
 const rows=style.rows??3,cols=style.cols??3;
 const candidate={id:style.id,type,bounds,color:style.color??'#223247',width:style.width??2,fill:style.fill??'none',text:style.text??'',font:style.font??FONTS[0],fontSize:style.fontSize??24,reverse:from.x>to.x,flipY:(to.x-from.x)*(to.y-from.y)<0,...(type==='table'?{rows,cols,cells:style.cells??Array.from({length:Number.isInteger(rows)&&rows>=1&&rows<=8?rows:0},()=>Array(Number.isInteger(cols)&&cols>=1&&cols<=8?cols:0).fill(''))}:{})};
 // Vertical lines need their start/end direction retained too.
 if(from.x===to.x&&from.y>to.y)candidate.reverse=true;
 return validateDrawingObjects([candidate])[0];
}
export function updateDrawingObject(note,id,patch){const objects=note.drawingObjects||[];if(!objects.some(o=>o.id===id))return note;if(patch?.id!==undefined&&patch.id!==id)throw Error('도형 ID는 변경할 수 없습니다.');const next=objects.map(o=>o.id===id?{...o,...patch,id}:o);return {...note,drawingObjects:validateDrawingObjects(next)};}
export function deleteDrawingObject(note,id){const objects=note.drawingObjects||[],next=objects.filter(o=>o.id!==id);return next.length===objects.length?note:{...note,drawingObjects:next};}
export function duplicateDrawingObject(note,id,newId){const objects=note.drawingObjects||[],object=objects.find(o=>o.id===id);if(!object)return note;return {...note,drawingObjects:validateDrawingObjects([...objects,{...moveDrawingObject(object,24,24),id:newId}])};}
export function moveDrawingObject(object,dx,dy){const o=validateDrawingObjects([object])[0];if(!Number.isFinite(dx)||!Number.isFinite(dy))fail();return {...o,bounds:{...o.bounds,x:Math.max(0,Math.min(W-o.bounds.width,o.bounds.x+dx)),y:Math.max(0,Math.min(H-o.bounds.height,o.bounds.y+dy))}};}
export function drawingObjectBounds(object){return {...validateDrawingObjects([object])[0].bounds};}
export function hitDrawingObject(object,point,padding=0){const b=drawingObjectBounds(object),p=Number.isFinite(padding)?Math.max(0,padding):0;return !!point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=b.x-p&&point.x<=b.x+b.width+p&&point.y>=b.y-p&&point.y<=b.y+b.height+p;}
const escape=s=>String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function labelColor(o){if(o.fill==='none')return o.color;const lum=c=>{const a=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722};const bg=lum(o.fill),fg=lum(o.color);if((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)>=3)return o.color;return bg<.3?'#ffffff':'#223247';}
function primitives(object){const o=validateDrawingObjects([object])[0],b=o.bounds,p=[],text=[];const line=(x1,y1,x2,y2)=>p.push({type:'line',x1,y1,x2,y2});const polygon=points=>p.push({type:'polygon',points});
 if(o.type==='rectangle'||o.type==='table')p.push({type:'rect',...b});
 if(o.type==='ellipse')p.push({type:'ellipse',cx:b.x+b.width/2,cy:b.y+b.height/2,rx:b.width/2,ry:b.height/2});
 if(o.type==='triangle')polygon([[b.x+b.width/2,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]]);
 if(o.type==='diamond')polygon([[b.x+b.width/2,b.y],[b.x+b.width,b.y+b.height/2],[b.x+b.width/2,b.y+b.height],[b.x,b.y+b.height/2]]);
 if(o.type==='line'||o.type==='arrow'){let a=[b.x,b.y+(o.flipY?b.height:0)],z=[b.x+b.width,b.y+(o.flipY?0:b.height)];if(o.reverse)[a,z]=[z,a];line(...a,...z);if(o.type==='arrow'){const dx=z[0]-a[0],dy=z[1]-a[1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,head=Math.min(18+o.width*2,length*.4);line(z[0],z[1],z[0]-ux*head-uy*head*.5,z[1]-uy*head+ux*head*.5);line(z[0],z[1],z[0]-ux*head+uy*head*.5,z[1]-uy*head-ux*head*.5);}}
 function label(value,box,center=false){const width=Math.max(1,box.width-12),cols=Math.max(1,Math.floor(width/(o.fontSize*.65))),lines=[];for(const paragraph of value.split('\n')){let line='',n=0;for(const c of paragraph){if(n>=cols){lines.push(line);line='';n=0;}line+=c;n++;}lines.push(line);}const capacity=Math.max(0,Math.floor((box.height-8)/(o.fontSize*1.25)));const shown=lines.slice(0,capacity),lineHeight=o.fontSize*1.25;text.push({box,lines:shown,x:center?box.x+box.width/2:box.x+6,y:center?box.y+(box.height-shown.length*lineHeight)/2+o.fontSize:box.y+4+o.fontSize,lineHeight,align:center?'center':'left'});}
 if(o.type==='table'){const cw=b.width/o.cols,ch=b.height/o.rows;for(let c=1;c<o.cols;c++)line(b.x+c*cw,b.y,b.x+c*cw,b.y+b.height);for(let r=1;r<o.rows;r++)line(b.x,b.y+r*ch,b.x+b.width,b.y+r*ch);for(let r=0;r<o.rows;r++)for(let c=0;c<o.cols;c++)label(o.cells[r][c],{x:b.x+c*cw,y:b.y+r*ch,width:cw,height:ch});}else if(o.text){let inner=b;if(o.type==='ellipse')inner={x:b.x+b.width*.15,y:b.y+b.height*.18,width:b.width*.7,height:b.height*.64};if(o.type==='diamond')inner={x:b.x+b.width*.27,y:b.y+b.height*.27,width:b.width*.46,height:b.height*.46};if(o.type==='triangle')inner={x:b.x+b.width*.28,y:b.y+b.height*.48,width:b.width*.44,height:b.height*.42};label(o.text,inner,true);}
 return {o,shapes:p,text,textColor:labelColor(o)};
}
export function objectSVG(object){const {o,shapes,text,textColor}=primitives(object),style=`stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round"`;const parts=shapes.map(s=>s.type==='line'?`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ${style}/>`:s.type==='polygon'?`<polygon points="${s.points.map(p=>p.join(',')).join(' ')}" fill="${o.fill}" ${style}/>`:`<${s.type} ${Object.entries(s).filter(([k])=>k!=='type').map(([k,v])=>`${k}="${v}"`).join(' ')} fill="${o.fill}" ${style}/>`);
 text.forEach(t=>{parts.push(`<svg x="${t.box.x}" y="${t.box.y}" width="${t.box.width}" height="${t.box.height}" viewBox="${t.box.x} ${t.box.y} ${t.box.width} ${t.box.height}" overflow="hidden" fill="${textColor}" font-family="${o.font}, NanumPenScript, sans-serif" font-size="${o.fontSize}" text-anchor="${t.align==='center'?'middle':'start'}">${t.lines.map((line,j)=>`<text x="${t.x}" y="${t.y+j*t.lineHeight}">${escape(line)}</text>`).join('')}</svg>`);});return parts.join('');}
export function drawDrawingObject(ctx,object){const {o,shapes,text,textColor}=primitives(object);ctx.save();try{ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.strokeStyle=o.color;ctx.lineWidth=o.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash?.([]);for(const s of shapes){ctx.beginPath();if(s.type==='line'){ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);}else if(s.type==='rect')ctx.rect(s.x,s.y,s.width,s.height);else if(s.type==='ellipse')ctx.ellipse(s.cx,s.cy,s.rx,s.ry,0,0,Math.PI*2);else{s.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}if(s.type!=='line'&&o.fill!=='none'){ctx.fillStyle=o.fill;ctx.fill();}ctx.stroke();}ctx.fillStyle=textColor;ctx.font=`${o.fontSize}px ${o.font}, NanumPenScript, sans-serif`;ctx.textBaseline='alphabetic';ctx.textAlign='left';for(const t of text){ctx.save();try{ctx.beginPath();ctx.rect(t.box.x,t.box.y,t.box.width,t.box.height);ctx.clip();ctx.textAlign=t.align;t.lines.forEach((line,i)=>ctx.fillText(line,t.x,t.y+i*t.lineHeight));}finally{ctx.restore();}}}finally{ctx.restore();}}
