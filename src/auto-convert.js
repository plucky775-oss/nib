/** No network or credentials live here. The owner must gate enable() on consent and
 * credentials. snapshot() returns an immutable {noteId, revision, key, ...payload}
 * or null for an empty/non-convertible page. key identifies the complete input.
 * apply(text, snapshot) must synchronously update only that snapshot's note.
 */
export function createAutoConverter({snapshot,recognize,apply,onStatus=()=>{},clock=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,idleMs=1800,minIntervalMs=10500,maxErrors=2,cacheLimit=12}={}){
 if(typeof snapshot!=='function'||typeof recognize!=='function'||typeof apply!=='function')throw Error('snapshot, recognize and apply are required');
 let enabled=false,busy=false,pending=false,timer=null,due=0,lastRequest=-Infinity,errors=0,epoch=0,session=0,controller=null,lastApplied=null;
 const cache=new Map();
 const identify=s=>s?JSON.stringify([s.noteId,s.revision,s.key]):null;
 const cacheKey=s=>JSON.stringify([s.noteId,s.key]);
 const notify=(type,extra={})=>onStatus({type,enabled,busy,pending,errors,...extra});
 function cancelTimer(){if(timer!==null){clearTimer(timer);timer=null}}
 function current(s,token){return enabled&&epoch===token&&identify(snapshot())===identify(s)}
 function remember(s,text){const key=cacheKey(s);cache.delete(key);cache.set(key,text);while(cache.size>cacheLimit)cache.delete(cache.keys().next().value)}
 function fail(error,requestSession){if(!enabled||requestSession!==session)return;errors++;if(errors>=maxErrors){enabled=false;pending=false;cancelTimer();notify('stopped',{reason:'consecutive-errors',error})}else notify('error',{error});}
 function commit(text,s,identity,cached){if(apply(text,s)===false){notify('stale');return;}lastApplied=identity;errors=0;notify('applied',{cached});}
 function schedule(){cancelTimer();if(!enabled||busy||!pending)return;timer=setTimer(()=>{timer=null;void run()},Math.max(0,due-clock()));}
 async function run(){
  if(!enabled||busy||!pending)return;
  const s=snapshot();pending=false;
  if(!s||typeof s.key!=='string'||!s.key){notify('empty');return;}
  const token=epoch,requestSession=session,identity=identify(s),key=cacheKey(s);
  if(lastApplied===identity){notify('unchanged');return;}
  if(cache.has(key)){
   if(current(s,token)){try{commit(cache.get(key),s,identity,true)}catch(error){fail(error,requestSession)}}
   return;
  }
  const remaining=lastRequest+minIntervalMs-clock();
  if(remaining>0){pending=true;due=Math.max(due,lastRequest+minIntervalMs);notify('waiting',{retryInMs:remaining});schedule();return;}
  busy=true;controller=new AbortController();lastRequest=clock();notify('recognizing');
  try{
   const text=await recognize(s,{signal:controller.signal});
   if(typeof text!=='string')throw Error('Invalid recognition result');
   // Cache completed stale results, but never overwrite a newer note or revision.
   remember(s,text);
   if(current(s,token)){commit(text,s,identity,false);}
   else if(enabled){if(requestSession===session)errors=0;notify('stale');}
  }catch(error){
   if(enabled&&requestSession===session)fail(error,requestSession);
   else if(enabled&&error?.name!=='AbortError')notify('stale');
  }finally{
   busy=false;controller=null;
   // No retry of a failed snapshot: only an explicitly queued newer change runs.
   if(enabled&&pending)schedule();
   notify('settled');
  }
 }
 return {
  enable(){if(enabled)return;enabled=true;errors=0;epoch++;session++;pending=true;due=clock()+idleMs;notify('enabled');schedule()},
  disable(){enabled=false;pending=false;epoch++;session++;cancelTimer();controller?.abort();notify('disabled')},
  changed(){epoch++;if(!enabled)return;pending=true;due=clock()+idleMs;notify('waiting',{retryInMs:idleMs});schedule()},
  flush(){if(!enabled)return false;epoch++;pending=true;due=clock();schedule();return true},
  state(){return {enabled,busy,pending,errors,cached:cache.size}},
  clearCache(){cache.clear();lastApplied=null}
 };
}
