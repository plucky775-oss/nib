/** Original, local-only cover designs. IDs are persisted; never rename old IDs.
 * Geometry and colors are fixed allowlisted constants, not imported CSS/artwork.
 */
export const COVER_PRESETS=Object.freeze([
 {id:'midnight',label:'미드나이트',color:'#253348',ink:'#f5f3ed',design:'solid'},
 {id:'ivory',label:'아이보리',color:'#eee8dc',ink:'#3b3b38',design:'solid'},
 {id:'slate',label:'슬레이트',color:'#6b7783',ink:'#ffffff',design:'solid'},
 {id:'clay',label:'클레이',color:'#ac8070',ink:'#ffffff',design:'solid'},
 {id:'lavender',label:'라벤더',color:'#b5acc6',ink:'#302c40',design:'solid'},
 {id:'navy-block',label:'네이비 컬러블록',color:'#f1ece2',ink:'#24354b',design:'block',accent:'#344d68',secondary:'#b8c6d0'},
 {id:'clay-block',label:'클레이 컬러블록',color:'#eee3d7',ink:'#493c38',design:'diagonal',accent:'#ac7866',secondary:'#d0ad98'},
 {id:'ivory-stripe',label:'아이보리 스트라이프',color:'#f6f1e6',ink:'#374558',design:'stripe',accent:'#9aabb9'},
 {id:'blue-pinstripe',label:'블루 핀스트라이프',color:'#637b92',ink:'#fffaf0',design:'pinstripe',accent:'#d9e2e8'},
 {id:'navy-label',label:'네이비 프레임',color:'#253348',ink:'#f5f3ed',design:'frame',accent:'#c5c4b2'},
 {id:'ivory-label',label:'아이보리 라벨',color:'#f1e8d8',ink:'#454647',design:'label',accent:'#a78b68',secondary:'#fff9ed'},
 {id:'blue-grid',label:'미스트 블루 그리드',color:'#e7edf0',ink:'#30465b',design:'grid',accent:'#a2b2bf'},
 {id:'clay-arch',label:'클레이 아치',color:'#efe7de',ink:'#3d3330',design:'arch',accent:'#c7a28f',secondary:'#e0c6b3'},
 {id:'sand-speckle',label:'샌드 스페클',color:'#eee7db',ink:'#38434a',design:'speckle',accent:'#9b8d7f'},
 {id:'slate-orbit',label:'슬레이트 오빗',color:'#e6e9e8',ink:'#394e63',design:'orbit',accent:'#8398a9',secondary:'#d3b7a5'}
].map(Object.freeze));
export function normalizeCover(value){return COVER_PRESETS.some(p=>p.id===value)?value:'midnight';}

/** Bounded deterministic decoration, with no title, URL, font or user markup. */
export function coverBackgroundSvg(value){
 const p=COVER_PRESETS.find(p=>p.id===normalizeCover(value));
 let art='';
 if(p.design==='block')art=`<path d="M0 306H300V400H0Z" fill="${p.accent}"/><path d="M228 0H300V306H228Z" fill="${p.secondary}"/><path d="M0 292H300V306H0Z" fill="${p.secondary}"/>`;
 else if(p.design==='diagonal')art=`<path d="M0 300L300 222V400H0Z" fill="${p.accent}"/><path d="M0 283L300 205V222L0 300Z" fill="${p.secondary}"/>`;
 else if(p.design==='stripe'||p.design==='pinstripe'){
  const gap=p.design==='stripe'?22:15,width=p.design==='stripe'?3:.8;
  for(let x=10;x<300;x+=gap)art+=`<path d="M${x} 0V400" stroke="${p.accent}" stroke-width="${width}" opacity=".5"/>`;
 }
 else if(p.design==='frame')art=`<rect x="24" y="28" width="252" height="344" rx="2" fill="none" stroke="${p.accent}" stroke-width="1.5"/><rect x="30" y="34" width="240" height="332" rx="1" fill="none" stroke="${p.accent}" stroke-width=".5"/><path d="M110 78H190M110 322H190" stroke="${p.accent}" stroke-width="1"/>`;
 else if(p.design==='label')art=`<rect x="34" y="68" width="232" height="264" rx="3" fill="${p.secondary}" stroke="${p.accent}" stroke-width="1"/><rect x="40" y="74" width="220" height="252" rx="1" fill="none" stroke="${p.accent}" stroke-width=".5"/><path d="M112 102H188M112 298H188" stroke="${p.accent}"/>`;
 else if(p.design==='grid'){
  for(let x=0;x<=300;x+=25)art+=`<path d="M${x} 0V400" stroke="${p.accent}" stroke-width=".65" opacity=".55"/>`;
  for(let y=0;y<=400;y+=25)art+=`<path d="M0 ${y}H300" stroke="${p.accent}" stroke-width=".65" opacity=".55"/>`;
 }
 else if(p.design==='arch')art=`<path d="M38 400V158a112 112 0 0 1 224 0V400Z" fill="${p.accent}"/><path d="M58 400V158a92 92 0 0 1 184 0V400" fill="none" stroke="${p.secondary}" stroke-width="1.5"/>`;
 else if(p.design==='speckle'){
  for(let i=0;i<42;i++){const x=8+(i*73%284),y=8+(i*113%384),r=(i%3+2)/2;art+=`<circle cx="${x}" cy="${y}" r="${r}" fill="${p.accent}" opacity="${i%2?'.38':'.22'}"/>`;}
 }
 else if(p.design==='orbit')art=`<circle cx="280" cy="48" r="93" fill="none" stroke="${p.accent}" stroke-width="1.2"/><circle cx="280" cy="48" r="109" fill="none" stroke="${p.accent}" stroke-width=".6"/><circle cx="22" cy="372" r="78" fill="${p.secondary}"/><circle cx="22" cy="372" r="95" fill="none" stroke="${p.accent}" stroke-width=".8"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400"><rect width="300" height="400" fill="${p.color}"/>${art}</svg>`;
}

/** One rendering contract for editor preview, picker swatches and library. */
export function applyCoverAppearance(element,value,className='notebook-cover'){
 const preset=COVER_PRESETS.find(p=>p.id===normalizeCover(value));
 element.className=className+' cover-'+preset.id;
 element.setAttribute('data-cover-id',preset.id);element.setAttribute('data-cover-design',preset.design);
 element.style.backgroundColor=preset.color;element.style.color=preset.ink;
 element.style.backgroundImage=preset.design==='solid'?'none':`url("data:image/svg+xml,${encodeURIComponent(coverBackgroundSvg(preset.id))}")`;
 element.style.backgroundSize='100% 100%';element.style.backgroundPosition='center';element.style.backgroundRepeat='no-repeat';
 return preset;
}
