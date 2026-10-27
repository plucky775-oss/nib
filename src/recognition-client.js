export const CLIENT_TIMEOUT_MS=70000;
export async function sendRecognition({image,accessToken,signal,fetcher=fetch,timeoutMs=CLIENT_TIMEOUT_MS,setTimer=setTimeout,clearTimer=clearTimeout,onSlow=()=>{}}){
 const controller=new AbortController();let timedOut=false;const abort=()=>controller.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimer(()=>{timedOut=true;controller.abort(new DOMException('Recognition deadline','TimeoutError'))},timeoutMs),slow=setTimer(onSlow,12000);
 const abortable=promise=>new Promise((resolve,reject)=>{const interrupted=()=>reject(controller.signal.reason||new DOMException('Aborted','AbortError'));if(controller.signal.aborted){Promise.resolve(promise).catch(()=>{});interrupted();return;}controller.signal.addEventListener('abort',interrupted,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',interrupted));});
 const failure=(message,code,retryRequiresConfirmation=false)=>Object.assign(new Error(message),{code,retryRequiresConfirmation});
 try{
  const res=await abortable(fetcher('./api/recognize',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:JSON.stringify({image,consent:true}),signal:controller.signal}));
  let result;try{result=await abortable(res.json())}catch(e){if(controller.signal.aborted)throw e;throw failure(res.status===504?'호스팅 응답 시간이 초과되었습니다. 원본은 보존됩니다.':'서버 응답을 읽지 못했습니다. 원본은 보존됩니다.',res.status===504?'HOST_TIMEOUT':'INVALID_RESPONSE',true)}
  if(!res.ok)throw Object.assign(failure(result.error||'인식에 실패했습니다.',result.code||'RECOGNITION_FAILED',result.retryRequiresConfirmation===true||res.status>=500),{status:res.status});
  if(typeof result.text!=='string')throw failure('인식 결과 형식이 올바르지 않습니다.','INVALID_RESPONSE',true);
  return result.text;
 }catch(e){
  if(timedOut)throw failure('브라우저에서 인식 응답을 기다리는 시간이 초과되었습니다. 이전 요청에 비용이 발생했을 수 있어 자동 재시도하지 않습니다.','CLIENT_TIMEOUT',true);
  if(signal?.aborted)throw e;
  if(e?.code)throw e;
  throw failure('인식 응답을 받지 못했습니다. 연결 상태를 확인하세요. 이전 요청에 비용이 발생했을 수 있습니다.','NETWORK_ERROR',true);
 }finally{clearTimer(timer);clearTimer(slow);signal?.removeEventListener('abort',abort)}
}
