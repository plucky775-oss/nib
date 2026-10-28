/** Shared by manual and automatic recognition. Consumption occurs at request
 * start, never refunded on cancellation/failure. Not cross-tab/account storage. */
export function createRecognitionBudget({clock=Date.now,maxRequests=6,windowMs=60000}={}){
 const limit=Number.isInteger(maxRequests)&&maxRequests>0?Math.min(6,maxRequests):6;
 const window=Number.isFinite(windowMs)?Math.max(60000,windowMs):60000,starts=[];
 function retryAt(){const now=clock();while(starts.length&&now-starts[0]>window)starts.shift();return starts.length>=limit?starts[0]+window+1:null}
 function retryInMs(){const at=retryAt();return at===null?0:Math.max(0,at-clock())}
 return {retryAt,retryInMs,reserve(){const at=retryAt();if(at!==null)return {ok:false,retryInMs:Math.max(0,at-clock()),retryAt:at};starts.push(clock());return {ok:true,retryInMs:0,retryAt:null}}};
}

/** No network or credentials live here. The owner must gate enable() on consent and
 * credentials. snapshot() returns an immutable {noteId, revision, key, ...payload}
 * or null for an empty/non-convertible page. key identifies the complete input.
 * setWriting(true/false) brackets active pointer strokes; null snapshots remain
 * reserved for empty/already-converted pages, not activity signaling.
 * apply(text, snapshot) must synchronously update only that snapshot's note.
 */
export function createAutoConverter({snapshot,recognize,apply,onStatus=()=>{},clock=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,idleMs=1200,minIntervalMs=0,maxErrors=2,cacheLimit=12,budget}={}){
 if(typeof snapshot!=='function'||typeof recognize!=='function'||typeof apply!=='function')throw Error('snapshot, recognize and apply are required');
 let enabled=false,busy=false,pending=false,writing=false,timer=null,countdownTimer=null,rateUntil=0,due=0,lastRequest=-Infinity,errors=0,epoch=0,session=0,controller=null,lastApplied=null;
 const cache=new Map(),requestBudget=budget||createRecognitionBudget({clock});
 function nextStartAt(){return Math.max(lastRequest+Math.max(0,minIntervalMs),requestBudget.retryAt()??-Infinity)}
 const identify=s=>s?JSON.stringify([s.noteId,s.revision,s.key]):null;
 const cacheKey=s=>JSON.stringify([s.noteId,s.key]);
 const notify=(type,extra={})=>onStatus({type,enabled,busy,pending,writing,errors,...extra});
 function cancelTimer(){if(timer!==null){clearTimer(timer);timer=null}if(countdownTimer!==null){clearTimer(countdownTimer);countdownTimer=null}}
 function countdown(){countdownTimer=null;if(!enabled||writing||busy||!pending||rateUntil<=clock())return;notify('waiting',{retryInMs:rateUntil-clock(),retryAt:rateUntil,reason:'request-budget',rateLimited:true});if(rateUntil-clock()>1000)countdownTimer=setTimer(countdown,1000)}
 function current(s,token){return enabled&&!writing&&epoch===token&&identify(snapshot())===identify(s)}
 function remember(s,text){const key=cacheKey(s);cache.delete(key);cache.set(key,text);while(cache.size>cacheLimit)cache.delete(cache.keys().next().value)}
 function fail(error,requestSession){if(!enabled||requestSession!==session)return;errors++;if(errors>=maxErrors){enabled=false;pending=false;cancelTimer();notify('stopped',{reason:'consecutive-errors',error})}else notify('error',{error});}
 function commit(text,s,identity,cached){if(apply(text,s)===false){notify('stale');return;}lastApplied=identity;errors=0;notify('applied',{cached});}
 function schedule(){cancelTimer();if(!enabled||writing||busy||!pending)return;timer=setTimer(()=>{timer=null;void run()},Math.max(0,due-clock()));if(rateUntil>clock()&&due>=rateUntil)countdownTimer=setTimer(countdown,Math.min(1000,rateUntil-clock()));}
 async function run(){
  if(!enabled||writing||busy||!pending)return;
  const s=snapshot();pending=false;
  if(!s||typeof s.key!=='string'||!s.key){notify('empty');return;}
  const token=epoch,requestSession=session,identity=identify(s),key=cacheKey(s);
  if(lastApplied===identity){notify('unchanged');return;}
  if(cache.has(key)){
   if(current(s,token)){try{commit(cache.get(key),s,identity,true)}catch(error){fail(error,requestSession)}}
   return;
  }
  const allowedAt=nextStartAt(),remaining=allowedAt-clock();
  if(remaining>0){rateUntil=allowedAt;pending=true;due=Math.max(due,allowedAt);notify('waiting',{retryInMs:remaining,retryAt:allowedAt,reason:'request-budget',rateLimited:true});schedule();return;}
  const reserved=requestBudget.reserve();if(!reserved.ok){rateUntil=reserved.retryAt;pending=true;due=rateUntil;notify('waiting',{retryInMs:reserved.retryInMs,retryAt:rateUntil,reason:'request-budget',rateLimited:true});schedule();return;}
  rateUntil=0;busy=true;controller=new AbortController();lastRequest=clock();notify('recognizing');
  try{
   const text=await recognize(s,{signal:controller.signal,budgetReserved:true});
   if(typeof text!=='string')throw Error('Invalid recognition result');
   // Cache completed stale results, but never overwrite a newer note or revision.
   remember(s,text);
   if(current(s,token)){commit(text,s,identity,false);}
   else if(enabled){if(requestSession===session)errors=0;notify(writing?'writing':'stale');}
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
  enable(){if(enabled)return;enabled=true;errors=0;epoch++;session++;pending=true;due=clock()+idleMs;notify(writing?'writing':'enabled');schedule()},
  disable(){enabled=false;pending=false;epoch++;session++;cancelTimer();controller?.abort();notify('disabled')},
  changed(){epoch++;if(!enabled)return;pending=true;due=clock()+idleMs;notify(writing?'writing':'waiting',{retryInMs:idleMs});schedule()},
  setWriting(active){
   active=!!active;if(active===writing)return;writing=active;epoch++;
   if(!enabled)return;
   pending=true;due=clock()+idleMs;cancelTimer();
   notify(active?'writing':'waiting',{retryInMs:idleMs});schedule();
  },
  flush(){if(!enabled)return false;epoch++;pending=true;due=clock();schedule();return true},
  state(){return {enabled,busy,pending,writing,errors,retryAt:enabled&&pending?Math.max(due,rateUntil):null,cached:cache.size}},
  clearCache(){cache.clear();lastApplied=null}
 };
}
