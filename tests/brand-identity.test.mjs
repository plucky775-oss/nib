import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mountLibrary} from '../src/library-view.js';
import {makeNote} from '../src/core.js';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root)),text=path=>read(path).toString('utf8');
const sha=value=>createHash('sha256').update(value).digest('hex'),html=text('index.html'),manifest=JSON.parse(text('public/manifest.webmanifest'));
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const tags=name=>[...html.matchAll(new RegExp('<'+name+'\\b[^>]*>','g'))].map(m=>attrs(m[0]));
const publicPath=src=>'public/'+src.replace(/^\.\//,'');
function png(buffer){assert.deepEqual([...buffer.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(buffer.toString('ascii',12,16),'IHDR');return [buffer.readUInt32BE(16),buffer.readUInt32BE(20)];}

// v34 is an identity-only release. These v33 (4ea03825) fingerprints intentionally
// guard persistence/auth/backup/gesture code against accidental rename/migration.
// Future functional changes must review/update these release-bound expectations.
const preserved={
 'src/app.js':'567644b6feb06bfd79f9093b7f542a936dc3c307e276f8c1367368656a3f0e35',
 'src/core.js':'59906ed42d4c80c482ec5e2c5f08dddfbaaecb948c3cea295321a8fb1ab98e4b',
 'src/storage.js':'55c584145cffcad2604dfaa4972b57668d8260be34fa6404b5bd0be9d4a4a467',
 'src/custom-fonts.js':'06697c97089fef8903c235a83c63e8a9e06671e381fe9595f60f5946408ba318',
 'src/notebooks.js':'f4180a28dddeec46e0f567332913e55c5faba930d8d050e75f0c1cd2380ba8ea',
 'src/library-model.js':'536e99b1d37dd1fa6361786e1879bcc97b06eeb5a55e37ea70415c8b4946d09c',
 'src/recognition-client.js':'9ca43dcab13946e1edaeace993c9cb4ef321321a5da50be75429df801b12b7e4',
 'api/recognize.js':'bee821b653d44bae23e9202c4d9f5c2b2b3c39d5d111d0595537713c4f471dbf',
 'api/status.js':'73ffa27854925c839052fb587d9848bbd1f7779bff5fa8e383aed8d06f5fa030'
};
for(const [path,expected]of Object.entries(preserved))test(`branding preserves v33 data/auth implementation byte-for-byte: ${path}`,()=>assert.equal(sha(read(path)),expected));

test('visible document identity, metadata and shelf/cover labels consistently use MOA NOTE',()=>{
 assert.match(html,/<title>모아노트 · MOA NOTE<\/title>/);const meta=tags('meta');for(const name of ['application-name','apple-mobile-web-app-title'])assert.equal(meta.find(m=>m.name===name)?.content,'모아노트');
 const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ');assert.doesNotMatch(visible,/\bnib\b/i);
 for(const label of ['MOA NOTE / PERSONAL NOTES','MOA NOTE / NOTEBOOK','MOA NOTE / LIBRARY'])assert.ok(visible.includes(label),label);
 assert.ok(tags('span').some(t=>t.class==='header-brand'&&t['aria-label']==='모아노트 MOA NOTE'));
 for(const icon of tags('img').filter(t=>/moa-(?:brand|header)-icon/.test(t.class||'')))assert.equal(icon.alt,'','Decorative symbol must not duplicate adjacent accessible brand text');
});


test('header, sidebar, library and help use symbol-first English-only captions, not a Korean wordmark bitmap',()=>{
 const header=html.match(/<span class="header-brand"[^>]*>(<img[^>]*>)<span>([^<]*)<\/span><\/span>/);assert.ok(header);assert.equal(header[2],'MOA NOTE');const headerImage=attrs(header[1]);assert.equal(headerImage.src,'./brand/moa-note-192.png');assert.equal(headerImage.alt,'');assert.equal(headerImage.width,'24');
 const figures=[...html.matchAll(/<figure\b([^>]*)>(<img[^>]*>)<figcaption>([^<]*)<\/figcaption><\/figure>/g)];assert.equal(figures.length,3);assert.deepEqual(figures.map(f=>attrs(f[1]).class).sort(),['moa-logo-lockup moa-about-logo','moa-logo-lockup moa-library-logo','moa-logo-lockup moa-sidebar-logo']);
 for(const figure of figures){assert.equal(figure[3],'MOA NOTE');assert.equal(attrs(figure[1])['aria-label'],'MOA NOTE');const image=attrs(figure[2]);assert.equal(image.src,'./brand/moa-note-192.png');assert.equal(image.alt,'');assert.equal(image.width,image.height);}
 assert.doesNotMatch(html,/moa-note-logo\.png/);assert.doesNotMatch(text('public/sw.js'),/moa-note-logo\.png/);assert.equal(existsSync(new URL('public/brand/moa-note-logo.png',root)),false);assert.match(html,/<h1 id="library-title">나의 서재<\/h1>/);assert.match(html,/aria-label="노트 제목"/);
});

test('manifest keeps installed-app route/display identity while updating the Korean name and PNG icons',()=>{
 assert.equal(manifest.name,'모아노트 · MOA NOTE');assert.equal(manifest.short_name,'모아노트');assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');if(manifest.id!==undefined)assert.equal(manifest.id,'./');
 assert.deepEqual(manifest.icons.map(i=>i.sizes).sort(),['192x192','512x512']);for(const icon of manifest.icons){assert.equal(icon.type,'image/png');assert.equal(icon.purpose,'any');assert.deepEqual(png(read(publicPath(icon.src))),icon.sizes.split('x').map(Number));}
 const links=tags('link');assert.equal(links.find(t=>t.rel==='manifest')?.href,'./manifest.webmanifest');const favicon=links.find(t=>t.rel==='icon'),apple=links.find(t=>t.rel==='apple-touch-icon');assert.equal(favicon.type,'image/png');assert.deepEqual(png(read(publicPath(favicon.href))),[32,32]);assert.equal(apple.sizes,'180x180');assert.deepEqual(png(read(publicPath(apple.href))),[180,180]);
});

const approvedAssets={
 'moa-note-icon.png':[[512,512],'363f550795aca4f5dc735f60e6040e8d3228ae0461993837c9c728347e0b3393'],
 'moa-note-192.png':[[192,192],'9fbeeea540b8325253a2dafea5b1b2e4e9d58c29d6dc56547e27256ccec3e098'],
 'moa-note-apple.png':[[180,180],'b0d249f0e9a176c1356a2ba6bd8e1ba15ac326cfaf4b70af2e70ee21794ac677'],
 'moa-note-favicon.png':[[32,32],'a536047db1cf574453758a9d6e8b174594a9f0b9e0f2ea566ee0741e3dd0df0c']
};
for(const [file,[size,hash]]of Object.entries(approvedAssets))test(`approved packaged brand asset remains exact: ${file}`,()=>{const data=read('public/brand/'+file);assert.deepEqual(png(data),size);assert.equal(sha(data),hash);});

test('legacy icon URL embeds the same approved 192px symbol, without scripts or external resources',()=>{
 const svg=text('public/icon.svg');assert.match(svg,/<title>모아노트 MOA NOTE<\/title>/);assert.doesNotMatch(svg,/<script|\son[a-z]+=|(?:href|src)="https?:\/\//i);const embedded=svg.match(/href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);assert.ok(embedded);assert.equal(sha(Buffer.from(embedded[1],'base64')),approvedAssets['moa-note-192.png'][1]);
});

test('all existing control IDs, note title input and paper coordinate system survive branding',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort();assert.equal(ids.length,188);assert.equal(new Set(ids).size,188);assert.equal(sha(JSON.stringify(ids)),'c87cf4313de05f9b5fc6d12f708ce452fcd42301797238b3b6e4a48f0a75481d');
 const title=tags('input').find(t=>t.id==='title');assert.equal(title.maxlength,'120');assert.equal(title['aria-label'],'노트 제목');assert.equal(title.value,'새 노트');assert.equal(tags('svg').find(t=>t.id==='canvas').viewBox,'0 0 900 1200');
 const app=text('src/app.js');for(const key of ['nib-active-page','nib-last-pages','nib-backup','nib-notebook'])assert.ok(app.includes(`'${key}'`));assert.match(text('src/storage.js'),/const DB='nib-notes-v1'/);assert.match(text('src/custom-fonts.js'),/indexedDB\.open\('nib-custom-fonts-v1',1\)/);
});

test('brand CSS preserves all prior gesture geometry and keeps the English caption below the symbol at every width',()=>{
 const css=text('src/styles.css'),[base,brand]=css.split('/* MOA NOTE identity:');assert.equal(sha(base.trim()),'658a49883e4fca9d37891a843018c6952612946e99e864f123857d65ba89d893');assert.ok(brand);
 assert.match(brand,/\.header-brand\{[^}]*flex-direction:column[^}]*min-width:48px/);assert.match(brand,/\.header-brand>span\{[^}]*display:block/);assert.match(brand,/\.moa-logo-lockup\{[^}]*flex-direction:column/);assert.match(brand,/\.moa-header-icon\{[^}]*width:24px;height:24px/);assert.doesNotMatch(brand,/header-brand[^}]*display:none/);assert.doesNotMatch(brand,/#(?:title|canvas|page|paper)|touch-action|pointer-events/);
 assert.match(base,/#title\{[^}]*min-width:0/);assert.match(base,/button\{[^}]*min-height:44px/);
});

test('library implementation changes only the cover brand literal, not notebook behavior',()=>{
 const actual=text('src/library-view.js');assert.ok(actual.includes("brand.textContent='MOA NOTE / NOTEBOOK'"));assert.equal(sha(actual.replace("brand.textContent='MOA NOTE / NOTEBOOK'","brand.textContent='NIB / NOTEBOOK'")),'4045a14616dc7170742aa1bc8732b8a453a4ba93e1b57597cc6384a27ed225cc');
});

test('actual library renders the new brand as safe text without renaming or modifying saved notebooks',async t=>{
 const elements=new Map();class Element{constructor(){this.children=[];this.attrs={};this.value='';this.style={};this.open=false;}setAttribute(k,v){this.attrs[k]=String(v);}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}showModal(){this.open=true;}close(){this.open=false;}set innerHTML(_){assert.fail('Brand/library must not inject HTML');}}
 const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},prior=globalThis.document;globalThis.document={getElementById:$,createElement:()=>new Element()};t.after(()=>{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;});
 const note={...makeNote(),id:'retained',notebookId:'retained',title:'NIB user title <img onerror=x>',text:'원래 필기와 사용자 제목 보존'},before=structuredClone(note),api=mountLibrary({getNotes:()=>[note],getCurrent:()=>note.id,beforeOpen:async()=>{},openNotebook:async()=>{},createNotebook:async()=>false,toggleFavorite:async()=>{}});await api.show();
 const open=$('library-items').children[0].children[0],cover=open.children[0];assert.equal(cover.children[0].textContent,'MOA NOTE / NOTEBOOK');assert.equal(cover.children[1].textContent,note.title);assert.equal(open.children[1].textContent,note.title);$('library-list').onclick();$('library-grid').onclick();assert.deepEqual(note,before);
});

test('actual service worker precaches every brand asset and cleans only older nib-shell caches',async()=>{
 const handlers=new Map(),opened=[],added=[],deleted=[];let claimed=0;const scope={self:{addEventListener(name,fn){handlers.set(name,fn);},clients:{claim(){claimed++;}}},caches:{open:async name=>{opened.push(name);return {addAll:async assets=>added.push(...assets)};},keys:async()=>['nib-shell-v39-save-snapshot','nib-shell-v40-moa-brand','other-app-cache','nib-notes-v1'],delete:async name=>{deleted.push(name);return true;}},indexedDB:{open(){assert.fail('Brand cache migration must not touch note databases');}}};
 vm.createContext(scope);vm.runInContext(text('public/sw.js'),scope);let pending;handlers.get('install')({waitUntil(p){pending=p;}});await pending;assert.deepEqual(opened,['nib-shell-v40-moa-brand']);
 for(const file of Object.keys(approvedAssets))assert.ok(added.includes('./brand/'+file));for(const required of ['./manifest.webmanifest','./icon.svg','./src/storage.js','./src/core.js','./src/app.js'])assert.ok(added.includes(required));for(const asset of added){const relative=asset.replace(/^\.\//,'');if(!relative)continue;assert.ok(read(relative.startsWith('src/')||relative==='index.html'?relative:'public/'+relative).length>0,asset);}
 handlers.get('activate')({waitUntil(p){pending=p;}});await pending;assert.deepEqual(deleted,['nib-shell-v39-save-snapshot']);assert.equal(claimed,1);
});
