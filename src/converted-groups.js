import {customFontId} from './custom-fonts.js';
// Text objects own their content and position; source IDs are provenance only.
export const MAX_GROUPS=200,MAX_GROUP_TEXT=50000,MAX_GROUP_TEXT_TOTAL=50000;
const PAGE={width:900,height:1200};
// Keep this allowlist aligned with core.FONTS; core imports this module, so do
// not import core here and introduce an initialization cycle.
const GROUP_FONT_IDS=new Set(['NanumPenScript','NanumBrushScript','Gaegu','GamjaFlower','PoorStory']);
export function groupFontOverrides({font,fontSize}={}){
 const result={};
 if(typeof font==='string'&&(GROUP_FONT_IDS.has(font)||(font.length===71&&customFontId(font))))result.font=font;
 if([24,32,40].includes(fontSize))result.fontSize=fontSize;
 return result;
}

const validId=s=>typeof s==='string'&&s.length>=1&&s.length<=100&&!/[^A-Za-z0-9_-]/.test(s);
const validBounds=b=>b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=PAGE.width+.001&&b.y+b.height<=PAGE.height+.001;
export function makeConvertedGroup(strokes,text,{id,font,fontSize}={}){
 if(typeof text!=='string'||!text.trim()||!Array.isArray(strokes)||!strokes.length)return null;
 if(text.length>MAX_GROUP_TEXT)throw Error('한 번의 변환 결과가 너무 깁니다. 필기를 나누어 변환해주세요.');
 if(!validId(id))throw Error('변환 영역 ID가 올바르지 않습니다.');
 let left=PAGE.width,top=PAGE.height,right=0,bottom=0,points=0;const strokeIds=[];
 for(const s of strokes){if(!s||!validId(s.id)||strokeIds.includes(s.id)||!Array.isArray(s.points)||!Number.isFinite(s.width)||s.width<1||s.width>15)throw Error('원본 필기 정보가 올바르지 않습니다.');strokeIds.push(s.id);for(const p of s.points){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>PAGE.width||p.y<0||p.y>PAGE.height)throw Error('원본 필기 좌표가 올바르지 않습니다.');const radius=s.width/2;left=Math.min(left,p.x-radius);top=Math.min(top,p.y-radius);right=Math.max(right,p.x+radius);bottom=Math.max(bottom,p.y+radius);points++;}}
 if(!points)return null;
 left=Math.max(0,left-3);top=Math.max(0,top-3);right=Math.min(PAGE.width,right+3);bottom=Math.min(PAGE.height,bottom+3);
 return {kind:'text-object',id,strokeIds,text,font:'NanumPenScript',fontSize:32,bounds:{x:left,y:top,width:right-left,height:bottom-top},...groupFontOverrides({font,fontSize})};
}
export function activeConvertedGroups(groups,strokes){return (Array.isArray(groups)?groups:[]).filter(g=>g&&validId(g.id)&&typeof g.text==='string'&&g.text.trim()&&validBounds(g.bounds));}
export function validateGroups(groups,strokes){
 if(!Array.isArray(groups))return [];
 if(groups.length>MAX_GROUPS)throw Error('텍스트 객체가 너무 많습니다. 원본 백업을 보관하고 페이지를 나누어주세요.');
 const usedIds=new Set(),result=[];let total=0,bodyCount=0;
 for(const g of groups){
  if(!g||!validId(g.id)||usedIds.has(g.id)||typeof g.text!=='string'||!g.text.trim()||!validBounds(g.bounds))continue;
  if(g.text.length>MAX_GROUP_TEXT||total+g.text.length>MAX_GROUP_TEXT_TOTAL)throw Error('텍스트 객체의 총 글자 수가 너무 많습니다. 원본 백업을 보관하고 페이지를 나누어주세요.');
  if(Array.isArray(g.strokeIds)&&g.strokeIds.length>5000)throw Error('텍스트 객체의 원본 연결이 너무 많습니다. 원본 백업을 보관해주세요.');
  const ids=[...new Set((Array.isArray(g.strokeIds)?g.strokeIds:[]).filter(validId))];
  if(g.body===true&&++bodyCount>1)throw Error('한 페이지에는 본문이 하나만 있을 수 있습니다. 원본 백업을 확인해주세요.');
  result.push({kind:'text-object',id:g.id,strokeIds:ids,text:g.text,bounds:{x:g.bounds.x,y:g.bounds.y,width:g.bounds.width,height:g.bounds.height},...groupFontOverrides(g),...(g.body===true?{body:true}:{}),...(g.recovery==='legacy-text'?{recovery:'legacy-text'}:{})});
  total+=g.text.length;usedIds.add(g.id);
 }
 return result;
}
export function appendTextObject(groups,newGroup){
 const current=Array.isArray(groups)?groups:[];if(!newGroup)return [...current];
 if(current.some(g=>g.id===newGroup.id))throw Error('이미 존재하는 텍스트 객체 ID입니다.');
 const validated=validateGroups([...current,newGroup],[]);
 if(validated.length!==current.length+1)throw Error('텍스트 객체 정보가 올바르지 않습니다.');
 return validated;
}
export function replaceGroups(groups,newGroup){if(!newGroup)return [...groups];const ids=new Set(newGroup.strokeIds);const next=groups.filter(g=>g.id!==newGroup.id&&!g.strokeIds.some(id=>ids.has(id)));if(next.length>=MAX_GROUPS||next.reduce((n,g)=>n+g.text.length,0)+newGroup.text.length>MAX_GROUP_TEXT_TOTAL)throw Error('변환 영역이 가득 찼습니다. 새 노트에서 이어서 써주세요.');return [...next,newGroup];}
export function fitGroupText(text,bounds,fontSize=32,{measure,minFontSize=8,lineHeight=1.2}={}){
 const value=typeof text==='string'?text:'';const requested=Number.isFinite(fontSize)?Math.max(8,Math.min(200,fontSize)):32;const minimum=Number.isFinite(minFontSize)?Math.max(8,Math.min(requested,minFontSize)):8;const ratio=Number.isFinite(lineHeight)?Math.max(1,lineHeight):1.2;
 if(!validBounds(bounds))return {lines:value.split('\n'),fontSize:minimum,lineHeight:minimum*ratio,overflow:true};
 const width=(str,size)=>{const measured=measure?.(str,size);return Number.isFinite(measured)&&measured>=0?measured:Array.from(str).reduce((n,c)=>n+(c===' '?0.4:/[\x00-\x7f]/.test(c)?0.7:1.05)*size,0)};
 function layout(size){const lines=[];for(const paragraph of value.split('\n')){let line='';for(const ch of paragraph){if(line&&width(line+ch,size)>bounds.width){lines.push(line);line='';}line+=ch;}lines.push(line);}return {lines,fontSize:size,lineHeight:size*ratio,overflow:lines.length*size*ratio>bounds.height+.001||lines.some(line=>width(line,size)>bounds.width+.001)};}
 let result=layout(requested);for(let size=requested-.5;result.overflow&&size>=minimum;size-=.5)result=layout(size);if(result.overflow&&result.fontSize!==minimum)result=layout(minimum);return result;
}
