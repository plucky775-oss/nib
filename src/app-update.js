export const APP_VERSION='2026.10.30.31';
export async function safeAppReload({isBusy,save,hasUnsaved,reload}){if(isBusy())return {ok:false,reason:'busy'};const saved=await save();if(saved===false||hasUnsaved())return {ok:false,reason:'unsaved'};reload();return {ok:true};}
export async function checkAppUpdate(fetcher=fetch){try{const r=await fetcher('./version.json',{cache:'no-store'});if(!r.ok)return null;const d=await r.json();return typeof d.version==='string'&&d.version!==APP_VERSION?d.version:null;}catch{return null;}}
