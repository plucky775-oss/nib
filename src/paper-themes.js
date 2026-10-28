const WIDTH=900,HEIGHT=1200;
const families=[['ivory','미색','#fffdf6','#c9b98c'],['blue','블루','#f5faff','#9ebbd1'],['green','그린','#f7fcf8','#a4bda9'],['red','로즈','#fff8f8','#d4a8ac']];
const variants=[['minimal','미니멀'],['frame','프레임'],['corner','코너']];
export const PAPER_THEMES=Object.freeze([{id:'white',label:'화이트',family:'white',color:'#ffffff'},...families.flatMap(([family,label,color])=>variants.map(([variant,name])=>({id:family+'-'+variant,label:label+' · '+name,family,color})))].map(Object.freeze));
export function normalizePaperTheme(id){return PAPER_THEMES.some(theme=>theme.id===id)?id:'white';}
// All geometry is original, code-native and restricted to the page edges.
// A shared display list keeps SVG and downloaded PNG backgrounds identical.
function primitives(page={}){
 const theme=PAPER_THEMES.find(t=>t.id===normalizePaperTheme(page?.paperTheme));
 const paper=['plain','grid','ruled'].includes(page?.paper)?page.paper:'ruled';
 const shapes=[{type:'rect',x:0,y:0,width:WIDTH,height:HEIGHT,fill:theme.color}];
 const line=(x1,y1,x2,y2,stroke,width=1)=>shapes.push({type:'line',x1,y1,x2,y2,stroke,width});
 if(paper==='ruled')for(let y=144;y<=1128;y+=48)line(48,y,852,y,'#e0e6ec');
 if(paper==='grid'){for(let x=24;x<WIDTH;x+=24)line(x,0,x,HEIGHT,'#e8edf2');for(let y=24;y<HEIGHT;y+=24)line(0,y,WIDTH,y,'#e8edf2');}
 if(theme.id==='white')return shapes;
 const accent=families.find(([family])=>family===theme.family)[3],variant=theme.id.slice(theme.family.length+1);
 if(variant==='minimal'){
  line(24,72,24,1128,accent,2);line(876,72,876,1128,accent,2);
  line(72,24,828,24,accent,1);line(72,1176,828,1176,accent,1);
 }else if(variant==='frame'){
  shapes.push({type:'rect',x:18,y:18,width:864,height:1164,stroke:accent,widthStroke:1.5});
  shapes.push({type:'rect',x:25,y:25,width:850,height:1150,stroke:accent,widthStroke:.5});
 }else{
  for(const [x,y,dx,dy] of [[24,24,1,1],[876,24,-1,1],[24,1176,1,-1],[876,1176,-1,-1]]){
   line(x,y,x+dx*48,y,accent,1.5);line(x,y,x,y+dy*48,accent,1.5);
   shapes.push({type:'circle',cx:x+dx*9,cy:y+dy*9,r:2.5,fill:accent});
  }
 }
 return shapes;
}
function svgShape(s){
 if(s.type==='line')return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.width}"/>`;
 if(s.type==='circle')return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"/>`;
 return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${s.fill||'none'}"${s.stroke?` stroke="${s.stroke}" stroke-width="${s.widthStroke}"`:''}/>`;
}
export function paperBackgroundSvg(page={}){return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">${primitives(page).map(svgShape).join('')}</svg>`;}
export function drawPaperBackground(ctx,page={}){
 ctx.save();try{ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.lineCap='butt';ctx.lineJoin='miter';ctx.setLineDash?.([]);
 for(const s of primitives(page)){
  if(s.type==='rect'){if(s.fill){ctx.fillStyle=s.fill;ctx.fillRect(s.x,s.y,s.width,s.height);}else{ctx.strokeStyle=s.stroke;ctx.lineWidth=s.widthStroke;ctx.strokeRect(s.x,s.y,s.width,s.height);}}
  else if(s.type==='line'){ctx.beginPath();ctx.strokeStyle=s.stroke;ctx.lineWidth=s.width;ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();}
  else{ctx.beginPath();ctx.fillStyle=s.fill;ctx.arc(s.cx,s.cy,s.r,0,Math.PI*2);ctx.fill();}
 }
 }finally{ctx.restore();}
}
