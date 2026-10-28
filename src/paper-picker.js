import {PAPER_THEMES,normalizePaperTheme,paperBackgroundSvg} from './paper-themes.js';

const FAILURE='종이 설정을 저장하지 못했습니다. 다시 시도해주세요.';

/** Local draft picker. The caller owns stopping input, persistence and history. */
export function mountPaperPicker({getNote,apply}){
  const $=id=>document.getElementById(id),dialog=$('paper-dialog'),list=$('paper-theme-list');
  const scope=$('paper-scope'),error=$('paper-error'),save=$('save-paper'),cancel=$('cancel-paper'),open=$('open-paper');
  const saveLabel=save.textContent||'적용';
  let draft='white',paper='ruled',busy=false,choices=[];

  function setError(message=''){error.textContent=message;error.hidden=!message;}
  function preview(){
    // Never copy note text, titles, or arbitrary markup into these SVGs.
    $('paper-sample').innerHTML=paperBackgroundSvg({paper,paperTheme:draft});
    for(const {button,theme}of choices)button.setAttribute('aria-pressed',String(theme.id===draft));
  }
  function setBusy(value){
    busy=value;save.disabled=value;cancel.disabled=value;scope.disabled=value;open.disabled=value;
    save.textContent=value?'적용 중…':saveLabel;dialog.setAttribute('aria-busy',String(value));
    for(const {button}of choices)button.disabled=value;
  }
  function renderChoices(){
    choices=PAPER_THEMES.map(theme=>{
      const button=document.createElement('button');button.type='button';button.className='paper-theme-choice';
      button.setAttribute('data-paper-theme',theme.id);button.setAttribute('data-paper-family',theme.family);
      button.setAttribute('aria-label',theme.family+' · '+theme.label);
      const swatch=document.createElement('span');swatch.className='paper-theme-swatch';swatch.setAttribute('aria-hidden','true');
      swatch.innerHTML=paperBackgroundSvg({paper:'plain',paperTheme:theme.id});
      const label=document.createElement('span');label.className='paper-theme-label';label.textContent=theme.label;
      const family=document.createElement('span');family.className='paper-theme-family';family.textContent=theme.family;
      button.append(swatch,label,family);
      button.onclick=()=>{if(busy)return false;draft=theme.id;setError();preview();return true;};
      return {button,theme};
    });
    list.replaceChildren(...choices.map(choice=>choice.button));preview();
  }
  function show(){
    if(busy||dialog.open)return false;
    const note=getNote();draft=normalizePaperTheme(note?.paperTheme);paper=note?.paper;
    scope.value='current';setError();renderChoices();setBusy(false);dialog.showModal();return true;
  }
  save.type='button';cancel.type='button';
  save.onclick=async()=>{
    if(busy||!dialog.open)return false;
    const request={paperTheme:normalizePaperTheme(draft),scope:scope.value==='notebook'?'notebook':'current'};
    setError();setBusy(true);
    try{
      const result=await apply(request);
      if(result===true){dialog.close();return true;}
      setError(FAILURE);return false;
    }catch(issue){
      setError(typeof issue?.message==='string'&&issue.message?issue.message:FAILURE);return false;
    }finally{setBusy(false);}
  };
  cancel.onclick=()=>{if(busy)return false;dialog.close();return true;};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  scope.onchange=()=>{if(!busy)setError();};
  open.onclick=show;
  return {show};
}
