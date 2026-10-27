// This module does not modify source strokes or infer text. Annotations are
// expendable; malformed annotations are dropped without losing the raw note.
export const MAX_GROUPS=200,MAX_GROUP_TEXT=1000,MAX_GROUP_TEXT_TOTAL=50000;
const PAGE={width:900,height:1200};
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
const validBounds=b=>b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=PAGE.width+.001&&b.y+b.height<=PAGE.height+.001;
export function makeConvertedGroup(strokes,text,{id}={}){
 if(typeof text!=='string'||!text.trim()||!Array.isArray(strokes)||!strokes.length)return null;
 if(text.length>MAX_GROUP_TEXT)throw Error('한 번의 변환 결과가 너무 깁니다. 필기를 나누어 변환해주세요.');
 if(!validId(id))throw Error('변환 영역 ID가 올바르지 않습니다.');
 let left=PAGE.width,top=PAGE.height,right=0,bottom=0,points=0;const strokeIds=[];
 for(const s of strokes){if(!s||!validId(s.id)||strokeIds.includes(s.id)||!Array.isArray(s.points)||!Number.isFinite(s.width)||s.width<1||s.width>15)throw Error('원본 필기 정보가 올바르지 않습니다.');strokeIds.push(s.id);for(const p of s.points){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>PAGE.width||p.y<0||p.y>PAGE.height)throw Error('원본 필기 좌표가 올바르지 않습니다.');const radius=s.width/2;left=Math.min(left,p.x-radius);top=Math.min(top,p.y-radius);right=Math.max(right,p.x+radius);bottom=Math.max(bottom,p.y+radius);points++;}}
 if(!points)return null;
 left=Math.max(0,left-3);top=Math.max(0,top-3);right=Math.min(PAGE.width,right+3);bottom=Math.min(PAGE.height,bottom+3);
 return {id,strokeIds,text,bounds:{x:left,y:top,width:right-left,height:bottom-top}};
}
export function activeConvertedGroups(groups,strokes){const ids=new Set(strokes.filter(s=>s&&validId(s.id)).map(s=>s.id));return (Array.isArray(groups)?groups:[]).filter(g=>g&&Array.isArray(g.strokeIds)&&g.strokeIds.length&&g.strokeIds.every(id=>ids.has(id)));}
export function validateGroups(groups,strokes){
 if(!Array.isArray(groups)||groups.length>MAX_GROUPS)return [];
 const sourceIds=new Set(strokes.filter(s=>s&&validId(s.id)).map(s=>s.id)),usedIds=new Set(),usedSources=new Set(),result=[];let total=0;
 for(const g of groups){if(!g||!validId(g.id)||usedIds.has(g.id)||typeof g.text!=='string'||!g.text.trim()||g.text.length>MAX_GROUP_TEXT||total+g.text.length>MAX_GROUP_TEXT_TOTAL||!validBounds(g.bounds)||!Array.isArray(g.strokeIds)||!g.strokeIds.length||g.strokeIds.length>5000)continue;const ids=new Set(g.strokeIds);if(ids.size!==g.strokeIds.length||g.strokeIds.some(id=>!validId(id)||!sourceIds.has(id)||usedSources.has(id)))continue;result.push({id:g.id,strokeIds:[...g.strokeIds],text:g.text,bounds:{x:g.bounds.x,y:g.bounds.y,width:g.bounds.width,height:g.bounds.height}});total+=g.text.length;usedIds.add(g.id);g.strokeIds.forEach(id=>usedSources.add(id));}
 return result;
}
export function replaceGroups(groups,newGroup){if(!newGroup)return [...groups];const ids=new Set(newGroup.strokeIds);const next=groups.filter(g=>g.id!==newGroup.id&&!g.strokeIds.some(id=>ids.has(id)));if(next.length>=MAX_GROUPS||next.reduce((n,g)=>n+g.text.length,0)+newGroup.text.length>MAX_GROUP_TEXT_TOTAL)throw Error('변환 영역이 가득 찼습니다. 새 노트에서 이어서 써주세요.');return [...next,newGroup];}
export function fitGroupText(text,bounds,fontSize=32,{measure,minFontSize=8,lineHeight=1.2}={}){
 const value=typeof text==='string'?text:'';const requested=Number.isFinite(fontSize)?Math.max(8,Math.min(200,fontSize)):32;const minimum=Number.isFinite(minFontSize)?Math.max(8,Math.min(requested,minFontSize)):8;const ratio=Number.isFinite(lineHeight)?Math.max(1,lineHeight):1.2;
 if(!validBounds(bounds))return {lines:value.split('\n'),fontSize:minimum,lineHeight:minimum*ratio,overflow:true};
 const width=(str,size)=>{const measured=measure?.(str,size);return Number.isFinite(measured)&&measured>=0?measured:Array.from(str).reduce((n,c)=>n+(c===' '?0.4:/[\x00-\x7f]/.test(c)?0.7:1.05)*size,0)};
 function layout(size){const lines=[];for(const paragraph of value.split('\n')){let line='';for(const ch of paragraph){if(line&&width(line+ch,size)>bounds.width){lines.push(line);line='';}line+=ch;}lines.push(line);}return {lines,fontSize:size,lineHeight:size*ratio,overflow:lines.length*size*ratio>bounds.height+.001||lines.some(line=>width(line,size)>bounds.width+.001)};}
 let result=layout(requested);for(let size=requested-.5;result.overflow&&size>=minimum;size-=.5)result=layout(size);if(result.overflow&&result.fontSize!==minimum)result=layout(minimum);return result;
}
