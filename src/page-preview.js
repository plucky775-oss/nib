import {strokeSvg} from './pen-renderer.js';
import {paperBackgroundSvg} from './paper-themes.js';
import {fitGroupText} from './converted-groups.js';
const BUILTIN=new Set(['NanumPenScript','NanumBrushScript','Gaegu','GamjaFlower','PoorStory']);
const font=value=>typeof value==='string'&&(BUILTIN.has(value)||/^custom_[a-f0-9]{64}$/.test(value))?value:'NanumPenScript';
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const number=n=>Number(n.toFixed(2));
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=900&&p.y>=0&&p.y<=1200;
const validBounds=b=>b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=900.001&&b.y+b.height<=1200.001;
function evenly(items,limit){if(items.length<=limit)return items;if(limit===1)return [items[0]];return Array.from({length:limit},(_,i)=>items[Math.round(i*(items.length-1)/(limit-1))]);}
/** Local-only SVG thumbnail. Sampling affects the preview, never source data.
 * Inline this markup to use already-loaded bundled/custom browser font faces.
 * Text objects are bounded independently and remain visible without source ink.
 */
export function renderPagePreview(page={}){
 const raw=Array.isArray(page.strokes)?page.strokes:[];
 let groups=page.showOriginal?[]:(Array.isArray(page.convertedGroups)?page.convertedGroups:[]).filter(g=>g&&typeof g.text==='string'&&g.text.trim()&&validBounds(g.bounds)).slice(0,200);
 if(!page.showOriginal&&!groups.length&&!raw.length&&typeof page.text==='string'&&page.text&&!page.textPlacementMissing)groups=[{text:page.text,bounds:{x:72,y:156,width:756,height:900}}];
 const covered=new Set(groups.flatMap(g=>Array.isArray(g.strokeIds)?g.strokeIds:[]));
 const strokes=evenly(raw.filter(s=>s&&Array.isArray(s.points)&&s.points.length&&!covered.has(s.id)),200),perStroke=Math.floor(3000/Math.max(1,strokes.length));
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200" width="900" height="1200" aria-hidden="true" focusable="false">'+paperBackgroundSvg(page);
 for(const s of strokes){const points=evenly(s.points,perStroke).filter(validPoint);if(!points.length)continue;svg+='<g data-preview-ink="true">'+strokeSvg(s,points)+'</g>';}
 for(const g of groups){const b=g.bounds,text=Array.from(g.text).slice(0,200).join(''),size=Number.isFinite(g.fontSize)?g.fontSize:page.fontSize,layout=fitGroupText(text,b,size),family=font(g.font||page.font);svg+=`<svg data-preview-object="true" x="${number(b.x)}" y="${number(b.y)}" width="${number(b.width)}" height="${number(b.height)}" viewBox="0 0 ${number(b.width)} ${number(b.height)}" overflow="hidden">`;layout.lines.forEach((line,i)=>{svg+=`<text x="0" y="${number(layout.fontSize*.9+i*layout.lineHeight)}" font-family="${xml(family)}, sans-serif" font-size="${number(layout.fontSize)}" fill="#223247" xml:space="preserve">${xml(line)}</text>`;});svg+='</svg>';}
 return svg+'</svg>';
}
