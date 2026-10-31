import {id as createId,validateNote,FONTS} from './core.js';
import {validateGroups,groupFontOverrides,MAX_GROUP_TEXT_TOTAL} from './converted-groups.js';

export const BODY_BOUNDS=Object.freeze({x:72,y:156,width:756,height:1020});
export function getBodyObject(note){return note?.convertedGroups?.find(group=>group.body===true)||null;}

/** Local, plain-text body editing. Never recognizes ink or mutates other objects. */
export function updateBodyText(note,text,{font,fontSize,id}={}){
 if(typeof text!=='string')throw Error('본문은 글자여야 합니다.');
 if(text.length>MAX_GROUP_TEXT_TOTAL)throw Error('본문이 너무 깁니다. 페이지를 나누어주세요.');
 const existing=note.convertedGroups||[];
 // Old backups may have text without positioned objects. Preserve it before
 // starting a new body instead of treating that legacy text as the new body.
 const groups=existing.length?existing:note.text?.trim()?validateNote(note).convertedGroups:existing;
 const bodies=groups.filter(group=>group.body===true);
 if(bodies.length>1)throw Error('한 페이지에는 본문이 하나만 있을 수 있습니다. 원본 백업을 확인해주세요.');
 const body=bodies[0];
 let convertedGroups;
 if(!text.trim())convertedGroups=groups.filter(group=>group!==body);
 else {
  const style={font:FONTS[0].id,fontSize:32,...groupFontOverrides({font:body?.font??note.font,fontSize:body?.fontSize??note.fontSize}),...groupFontOverrides({font,fontSize})};
  const object={kind:'text-object',id:body?.id??id??createId(),body:true,text,strokeIds:[],bounds:{...(body?.bounds||BODY_BOUNDS)},...style};
  convertedGroups=body?groups.map(group=>group===body?object:group):[...groups,object];
 }
 const checked=validateGroups(convertedGroups,note.strokes);
 if(checked.length!==convertedGroups.length)throw Error('본문 정보가 올바르지 않습니다.');
 const aggregate=convertedGroups.map(group=>group.text).join('\n');
 if(aggregate.length>MAX_GROUP_TEXT_TOTAL)throw Error('페이지의 전체 글이 너무 깁니다. 페이지를 나누어주세요.');
 return {...note,convertedGroups,text:aggregate,textPlacementMissing:false,mode:'text',showOriginal:false};
}

/** Same shape as fitGroupText, but body text never shrinks or truncates. */
export function layoutBodyText(text,bounds,fontSize=32,{measure}={}){
 const value=typeof text==='string'?text:'';
 const size=Number.isFinite(fontSize)&&fontSize>0?fontSize:32,lineHeight=size*1.2;
 if(!bounds||!Number.isFinite(bounds.width)||!Number.isFinite(bounds.height)||bounds.width<=0||bounds.height<=0)return {lines:value.split('\n'),fontSize:size,lineHeight,overflow:true};
 const width=str=>{const measured=measure?.(str,size);return Number.isFinite(measured)&&measured>=0?measured:Array.from(str).reduce((n,c)=>n+(c===' '?0.4:/[\x00-\x7f]/.test(c)?0.7:1.05)*size,0);};
 const lines=[];
 for(const paragraph of value.replace(/\r\n?/g,'\n').split('\n')){
  let line='';
  for(const ch of paragraph){if(line&&width(line+ch)>bounds.width){lines.push(line);line='';}line+=ch;}
  lines.push(line);
 }
 return {lines,fontSize:size,lineHeight,overflow:lines.length*lineHeight>bounds.height+.001||lines.some(line=>width(line)>bounds.width+.001)};
}
