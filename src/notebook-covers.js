/** Fixed local colors only: imported note metadata never becomes arbitrary CSS. */
export const COVER_PRESETS=Object.freeze([
 {id:'midnight',label:'미드나이트',color:'#253348',ink:'#f5f3ed'},
 {id:'ivory',label:'아이보리',color:'#eee8dc',ink:'#3b3b38'},
 {id:'slate',label:'슬레이트',color:'#6b7783',ink:'#ffffff'},
 {id:'clay',label:'클레이',color:'#ac8070',ink:'#ffffff'},
 {id:'lavender',label:'라벤더',color:'#b5acc6',ink:'#302c40'}
].map(Object.freeze));
export function normalizeCover(value){return COVER_PRESETS.some(p=>p.id===value)?value:'midnight';}
