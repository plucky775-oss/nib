import {validateGroups} from './converted-groups.js';

// Keep text edits local to one object. Source ink remains immutable so a font
// conversion can be restored even after saving and reopening the page.
export function editTextObject(note, objectId, {text, width, height}) {
  const groups=note.convertedGroups||[], target=groups.find(g=>g.id===objectId);
  if(!target)throw Error('수정할 글을 다시 선택해주세요.');
  if(typeof text!=='string'||!text.trim())throw Error('내용을 입력해주세요. 글을 없애려면 선택 삭제를 사용하세요.');
  const bounds={...target.bounds,width:Number(width),height:Number(height)};
  if(!Number.isFinite(bounds.width)||!Number.isFinite(bounds.height)||bounds.width<1||bounds.height<1||bounds.x+bounds.width>900||bounds.y+bounds.height>1200)throw Error('글 상자가 종이 안에 들어오도록 크기를 조절해주세요.');
  const next=groups.map(g=>g===target?{...g,text,bounds}:g);
  if(validateGroups(next,note.strokes).length!==next.length)throw Error('글 상자 정보를 확인해주세요.');
  if(target.text===text&&target.bounds.width===bounds.width&&target.bounds.height===bounds.height)return note;
  return {...note,convertedGroups:next,text:next.map(g=>g.text).join('\n'),textPlacementMissing:false};
}

export function restoreTextObjects(note, objectIds) {
  const groups=note.convertedGroups||[], ids=new Set(objectIds), selected=groups.filter(g=>ids.has(g.id));
  if(!selected.length)throw Error('손글씨로 되돌릴 변환 글을 선택해주세요.');
  const inkIds=new Set(note.strokes.map(s=>s.id));
  if(selected.some(g=>!g.strokeIds?.length||g.strokeIds.some(id=>!inkIds.has(id))))throw Error('원본 획이 모두 남아 있는 글만 되돌릴 수 있어요. 현재 글은 그대로 유지됩니다.');
  const next=groups.filter(g=>!ids.has(g.id)), restoredIds=new Set(selected.flatMap(g=>g.strokeIds));
  if(next.some(g=>g.strokeIds.some(id=>restoredIds.has(id))))throw Error('같은 원본을 쓰는 변환 글을 함께 선택해주세요. 현재 글은 그대로 유지됩니다.');
  return {...note,convertedGroups:next,text:next.map(g=>g.text).join('\n'),textPlacementMissing:false,showOriginal:false};
}

export function mountTextObjectEditor({getNote,getSelection,beforeOpen,apply,notify,root=document}) {
  const $=id=>root.getElementById(id);
  let draft=null;
  const close=()=>{draft=null;$('object-editor').hidden=true;};
  $('selection-edit').onclick=()=>{
    const ids=[...getSelection()];beforeOpen();
    const page=getNote(),group=ids.length===1?page.convertedGroups?.find(g=>g.id===ids[0]):null;
    if(!group)return notify('수정할 변환 글 하나를 선택해주세요.');
    draft={pageId:page.id,groupId:group.id,before:JSON.stringify(group)};
    $('object-text').value=group.text;
    for(const [name,limit]of [['width',900-group.bounds.x],['height',1200-group.bounds.y]]) {
      const input=$('object-'+name);input.max=String(limit);input.value=String(group.bounds[name]);
    }
    $('object-edit-error').textContent='';$('object-editor').hidden=false;
    $('object-text').focus();
  };
  $('cancel-object-edit').onclick=close;
  $('object-edit-form').onsubmit=e=>{
    e.preventDefault();if(!draft||$('object-editor').hidden)return;
    const page=getNote(),group=page.convertedGroups?.find(g=>g.id===draft.groupId);
    if(page.id!==draft.pageId||JSON.stringify(group)!==draft.before){$('object-edit-error').textContent='선택한 글이 바뀌었습니다. 닫고 다시 선택해주세요.';return;}
    try {
      const next=editTextObject(page,draft.groupId,{text:$('object-text').value,width:$('object-width').value,height:$('object-height').value});
      if(next!==page)apply(next,'선택한 글과 상자 크기를 같은 페이지에 적용했습니다.');
      close();
    }catch(e){$('object-edit-error').textContent=e.message;}
  };
  $('selection-restore').onclick=()=>{
    const ids=[...getSelection()];beforeOpen();
    try{const next=restoreTextObjects(getNote(),ids);apply(next,'선택한 글을 원래 손글씨로 되돌렸습니다. 실행 취소로 폰트 글을 복원할 수 있어요.');close();}catch(e){notify(e.message);}
  };
  return {close};
}
