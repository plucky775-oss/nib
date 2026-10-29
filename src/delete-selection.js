/** Delete explicit content only. Caller owns confirmation, history and persistence.
 * Source references are provenance: removing them never deletes another durable
 * object. Deleting an object also removes its existing hidden source ink so that
 * toggling original view cannot resurrect the deleted content.
 */
export function deleteSelectedContent(note,strokeIds=[],objectIds=[]){
 const strokes=Array.isArray(note?.strokes)?note.strokes:[],groups=Array.isArray(note?.convertedGroups)?note.convertedGroups:[];
 const requestedRaw=new Set(Array.isArray(strokeIds)?strokeIds:[]),requestedObjects=new Set(Array.isArray(objectIds)?objectIds:[]);
 const deleted=new Set(groups.filter(g=>requestedObjects.has(g.id)||(g.kind!=='text-object'&&Array.isArray(g.strokeIds)&&g.strokeIds.length>0&&g.strokeIds.every(id=>requestedRaw.has(id)))));
 const removeRaw=new Set(requestedRaw);for(const g of deleted)for(const id of Array.isArray(g.strokeIds)?g.strokeIds:[])removeRaw.add(id);
 const nextStrokes=strokes.filter(s=>!removeRaw.has(s.id)),nextGroups=groups.filter(g=>!deleted.has(g));
 const deletedStrokes=strokes.length-nextStrokes.length,deletedObjects=groups.length-nextGroups.length;
 if(!deletedStrokes&&!deletedObjects)return {note,changed:false,deletedObjects:0,deletedStrokes:0};
 // No groups ever existed: free legacy text is unrelated to the selected raw ink.
 // If objects existed, synchronize their aggregate so last-object deletion cannot
 // trigger legacy-text recovery on the next validation/backup round trip.
 const text=groups.length?nextGroups.map(g=>typeof g.text==='string'?g.text:'').join('\n'):note.text;
 return {note:{...note,strokes:nextStrokes,convertedGroups:nextGroups,text,textPlacementMissing:groups.length?false:note.textPlacementMissing},changed:true,deletedObjects,deletedStrokes};
}
