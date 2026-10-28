import {deriveInkRows,distributeTextAcrossRows} from './ink-lines.js';
import {MAX_GROUPS,MAX_GROUP_TEXT,MAX_GROUP_TEXT_TOTAL} from './converted-groups.js';

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const boundsKeys=['x','y','width','height'];
const validBounds=b=>b&&boundsKeys.every(key=>Number.isFinite(b[key]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=900.001&&b.y+b.height<=1200.001;
const sameBounds=(a,b)=>boundsKeys.every(key=>a[key]===b[key]);
const validStroke=s=>s&&validId(s.id)&&Number.isFinite(s.width)&&s.width>=1&&s.width<=15&&Array.isArray(s.points)&&s.points.length>0&&s.points.length<=12000&&s.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=900&&p.y>=0&&p.y<=1200);

function rowId(parentId,index,reserved){
  let attempt=0,candidate;
  do{
    const suffix=`_row_${index+1}${attempt?`_${attempt}`:''}`;
    candidate=parentId.slice(0,100-suffix.length)+suffix;
    attempt++;
  }while(reserved.has(candidate));
  reserved.add(candidate);
  return candidate;
}

function explicitRows(group,strokes,sourceCounts,groupCounts,sourceUses){
  if(!group||!validId(group.id)||groupCounts.get(group.id)!==1||!validBounds(group.bounds)||typeof group.text!=='string'||!group.text.trim()||group.text.length>MAX_GROUP_TEXT||!Array.isArray(group.strokeIds)||!group.strokeIds.length||group.strokeIds.length>5000)return null;
  const ids=new Set(group.strokeIds);
  if(ids.size!==group.strokeIds.length||group.strokeIds.some(id=>!validId(id)||sourceCounts.get(id)!==1||sourceUses.get(id)!==1))return null;
  // Use the same source ordering as app.groupLayout, not an inferred text order.
  const source=strokes.filter(s=>ids.has(s?.id));
  if(source.length!==ids.size||!source.every(validStroke))return null;
  const geometry=deriveInkRows(source);
  if(geometry.ambiguous||geometry.rows.length<2)return null;
  const distributed=distributeTextAcrossRows(group.text,geometry.rows);
  if(distributed.ambiguous||distributed.strategy!=='explicit-lines'||distributed.unplacedText||distributed.rows.map(row=>row.sourceText).join('')!==group.text)return null;
  const seen=new Set();
  for(const row of distributed.rows){
    if(!row.text.trim()||!validBounds(row.bounds)||!row.strokeIds?.length)return null;
    for(const id of row.strokeIds){if(!validId(id)||!ids.has(id)||seen.has(id))return null;seen.add(id);}
    // Splitting must not change the existing render placement. Refuse rather
    // than approximate if deriving this row alone would alter its anchor/box.
    const rowIds=new Set(row.strokeIds),standalone=deriveInkRows(source.filter(s=>rowIds.has(s.id)));
    if(standalone.ambiguous||standalone.rows.length!==1||!sameBounds(standalone.rows[0].bounds,row.bounds))return null;
  }
  return seen.size===ids.size?distributed.rows:null;
}

/**
 * Safely normalize multirow annotations into independently selectable groups.
 *
 * No OCR, proportional text guesses, source edits, note mutation or font
 * measurement occurs here. Only an unambiguous geometric row per explicit
 * nonempty text line is supported. Each child `text` is the EXACT `sourceText`
 * slice (including its existing CRLF/LF); groupLayout's single-row distributor
 * removes that final separator for display, just as it did before the split.
 * Source IDs partition the parent IDs; optional font overrides retain their
 * current fallback semantics. Unrelated/unsupported groups keep their identity.
 *
 * Returns the input array itself when no group can safely split. Otherwise the
 * new array has at most MAX_GROUPS entries. IDs are deterministic, collision-safe
 * within the whole array and satisfy the existing <=100-character ID schema.
 * Repeated normalization is idempotent. The caller owns persistence/history;
 * assign the returned groups before selection, rather than splitting only the
 * rendered view. Do not reconstruct aggregate note.text by inserting separators
 * between these children: their text already retains the original separators.
 */
export function normalizeConvertedLines(groups,strokes){
  if(!Array.isArray(groups)||!groups.length||groups.length>MAX_GROUPS||!Array.isArray(strokes))return groups;
  if(groups.reduce((total,g)=>total+(typeof g?.text==='string'?g.text.length:0),0)>MAX_GROUP_TEXT_TOTAL)return groups;
  const sourceCounts=new Map(),groupCounts=new Map(),sourceUses=new Map(),reserved=new Set();
  for(const s of strokes)if(s&&validId(s.id))sourceCounts.set(s.id,(sourceCounts.get(s.id)||0)+1);
  for(const group of groups){
    if(validId(group?.id)){reserved.add(group.id);groupCounts.set(group.id,(groupCounts.get(group.id)||0)+1);}
    if(Array.isArray(group?.strokeIds))for(const id of group.strokeIds)sourceUses.set(id,(sourceUses.get(id)||0)+1);
  }
  let available=MAX_GROUPS-groups.length,changed=false;
  const result=[];
  for(const group of groups){
    const rows=available>0?explicitRows(group,strokes,sourceCounts,groupCounts,sourceUses):null;
    if(!rows||rows.length-1>available){result.push(group);continue;}
    for(const [index,row]of rows.entries())result.push({...group,id:rowId(group.id,index,reserved),strokeIds:[...row.strokeIds],text:row.sourceText,bounds:{...row.bounds}});
    available-=rows.length-1;
    changed=true;
  }
  return changed?result:groups;
}
