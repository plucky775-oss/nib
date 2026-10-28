import {PEN_KINDS,strokeSvg} from './pen-renderer.js';

const WIDTHS=[2,3,5],DEFAULT_COLOR='#223247';
const kindOf=value=>PEN_KINDS.some(kind=>kind.id===value)?value:(PEN_KINDS.find(kind=>kind.id==='ballpoint')||PEN_KINDS[0]).id;
const widthOf=value=>WIDTHS.includes(Number(value))?Number(value):3;
const colorOf=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():DEFAULT_COLOR;
const FAILURE='펜 설정을 적용하지 못했습니다. 다시 시도해주세요.';

/** One fixed reference wave; pressure is illustrative, not sampled device input. */
function sample({penKind,width,color}){
  const points=Array.from({length:49},(_,i)=>{const t=i/48;return {x:16+208*t,y:35-16*Math.sin(2*Math.PI*t),pressure:.2+.8*Math.sin(Math.PI*t)};});
  const fragment=strokeSvg({id:'pen-preview-'+penKind,penKind,width,color,points});
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 70" width="100%" height="70" aria-hidden="true" focusable="false">'+fragment+'</svg>';
}

/** Draft-only controls. apply owns settings for FUTURE strokes; no ink is edited. */
export function mountPenPicker({getSettings,apply}){
  const $=id=>document.getElementById(id),dialog=$('pen-dialog'),list=$('pen-kind-list');
  const width=$('pen-width-select'),color=$('pen-color-input'),error=$('pen-error'),save=$('save-pen'),cancel=$('cancel-pen'),open=$('open-pen');
  const saveLabel=save.textContent||'이 펜으로 쓰기';
  let draft={penKind:kindOf(),width:3,color:DEFAULT_COLOR},busy=false,choices=[];
  function setError(message=''){error.textContent=message;error.hidden=!message;}
  function preview(all=false){
    for(const {button,kind,swatch}of choices){
      button.setAttribute('aria-pressed',String(kind.id===draft.penKind));
      if(all)swatch.innerHTML=sample({...draft,penKind:kind.id});
    }
    $('pen-sample').innerHTML=sample(draft);
  }
  function setBusy(value){
    busy=value;save.disabled=value;cancel.disabled=value;width.disabled=value;color.disabled=value;open.disabled=value;
    save.textContent=value?'적용 중…':saveLabel;dialog.setAttribute('aria-busy',String(value));
    for(const {button}of choices)button.disabled=value;
  }
  function renderChoices(){
    choices=PEN_KINDS.map(kind=>{
      const button=document.createElement('button');button.type='button';button.className='pen-kind-choice';
      button.setAttribute('data-pen-kind',kind.id);button.setAttribute('aria-label',kind.label);
      const swatch=document.createElement('span');swatch.className='pen-kind-swatch';swatch.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='pen-kind-label';label.textContent=kind.label;
      button.append(swatch,label);button.onclick=()=>{if(busy)return false;draft={...draft,penKind:kind.id};setError();preview();return true;};
      return {button,kind,swatch};
    });
    list.replaceChildren(...choices.map(choice=>choice.button));preview(true);
  }
  function show(){
    if(busy||dialog.open)return false;
    const settings=getSettings();draft={penKind:kindOf(settings?.penKind),width:widthOf(settings?.width),color:colorOf(settings?.color)};
    width.value=String(draft.width);color.value=draft.color;setError();renderChoices();setBusy(false);dialog.showModal();return true;
  }
  width.onchange=()=>{if(busy)return false;draft={...draft,width:widthOf(width.value)};width.value=String(draft.width);setError();preview(true);return true;};
  const changeColor=()=>{if(busy)return false;draft={...draft,color:colorOf(color.value)};color.value=draft.color;setError();preview(true);return true;};
  color.oninput=changeColor;color.onchange=changeColor;
  save.type='button';cancel.type='button';
  save.onclick=async()=>{
    if(busy||!dialog.open)return false;
    const settings={...draft};setError();setBusy(true);
    try{
      const result=await apply(settings);
      if(result===true){dialog.close();return true;}
      setError(FAILURE);return false;
    }catch(issue){setError(typeof issue?.message==='string'&&issue.message?issue.message:FAILURE);return false;}
    finally{setBusy(false);}
  };
  cancel.onclick=()=>{if(busy)return false;dialog.close();return true;};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  open.onclick=show;
  return {show};
}
