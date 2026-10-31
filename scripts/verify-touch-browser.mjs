// Optional browser regression suite: build first; install Playwright or set NIB_PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const playwright=await import(process.env.NIB_PLAYWRIGHT_MODULE || 'playwright');
const {chromium}=playwright.default||playwright;
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(path.resolve('dist'),decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{const body=fs.readFileSync(file);res.setHeader('Content-Type',({'js':'text/javascript','css':'text/css','html':'text/html','json':'application/json','svg':'image/svg+xml'})[file.split('.').at(-1)]||'application/octet-stream');res.end(body)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.NIB_CHROMIUM_PATH || undefined,headless:true});
 const errors=[];
 for(const [width,height] of [[1024,768],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/status',r=>r.fulfill({json:{configured:false}}));
  await page.goto(url);
  await page.waitForFunction(()=>!document.querySelector('.app').inert);
  await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await page.waitForTimeout(100);
  console.log('loaded',width,await page.locator('#paper-viewport').boundingBox());
  const cdp=await context.newCDPSession(page);
  const send=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:5,radiusY:5,force:.5}))});
  const box=await page.locator('#paper-viewport').boundingBox();
  const x=box.x+box.width*.8,y=box.y+Math.min(130,box.height/2);
  const original=await page.evaluate(()=>({top:document.querySelector('.editor-chrome').getBoundingClientRect().top,left:document.querySelector('.editor-chrome').getBoundingClientRect().left,scale:visualViewport.scale,scrollX,scrollY,position:document.querySelector('#page-position').textContent}));
  const paperView=()=>page.locator('#page').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return {x:m.e,y:m.f,scale:m.a}});
  // One finger moves only the paper vertically, bounded by its top and bottom.
  const before=await paperView(),paperBox=await page.locator('#page').boundingBox();
  await send('touchStart',[[1,x,y]]);await send('touchMove',[[1,x+4,y-80]]);await send('touchEnd',[]);
  const scrolled=await paperView();
  assert.ok(Math.abs(scrolled.y-Math.max(Math.min(0,box.height-paperBox.height),-80))<1);
  assert.equal(scrolled.x,before.x);assert.equal(scrolled.scale,before.scale);
  assert.equal(await page.locator('#page-position').textContent(),original.position);
  await send('touchStart',[[1,x,y]]);await send('touchMove',[[1,x,y+80]]);await send('touchEnd',[]);
  assert.deepEqual(await paperView(),before);
  assert.equal(await page.locator('#page-position').textContent(),original.position);
  // A long horizontal drag is fixed until release and adds exactly one page.
  const drag=Math.max(120,Math.min(220,box.width*.28))+20;
  await send('touchStart',[[1,x,y]]);
  for(let i=1;i<=6;i++)await send('touchMove',[[1,x-drag*i/6,y]]);
  assert.equal(await page.locator('#page-position').textContent(),original.position);
  assert.equal(await page.locator('#page-add-hint').textContent(),'놓으면 새 페이지 추가');
  await send('touchEnd',[]);
  await page.waitForFunction(()=>document.querySelector('#page-position').textContent==='2 / 2');
  assert.equal(await page.locator('#page-add-hint').isHidden(),true);
  // Visit adjacent pages in order. Only the final page may append a new page.
  async function turn(direction,position,label){
   const start=direction>0?box.x+box.width*.2:x;
   const current=await page.locator('#page-position').textContent();
   const fixedPaper=await page.locator('#page').getAttribute('style');
   await send('touchStart',[[1,start,y]]);
   for(let i=1;i<=6;i++)await send('touchMove',[[1,start+direction*drag*i/6,y]]);
   assert.equal(await page.locator('#page-position').textContent(),current);
   assert.equal(await page.locator('#page').getAttribute('style'),fixedPaper);
   if(label)assert.equal(await page.locator('#page-add-hint').textContent(),label);
   else assert.equal(await page.locator('#page-add-hint').isHidden(),true);
   await send('touchEnd',[]);
   await page.waitForFunction(expected=>document.querySelector('#page-position').textContent===expected&&!document.querySelector('.app').inert,position);
  }
  await turn(-1,'3 / 3','놓으면 새 페이지 추가');
  await turn(1,'2 / 3','놓으면 이전 페이지로 이동');
  await turn(1,'1 / 3','놓으면 이전 페이지로 이동');
  await turn(1,'1 / 3',null);
  await turn(-1,'2 / 3','놓으면 다음 페이지로 이동');
  await turn(-1,'3 / 3','놓으면 다음 페이지로 이동');
  await turn(-1,'4 / 4','놓으면 새 페이지 추가');
  // Native multi-touch must change the paper scale, never the visual viewport.
  const cx=box.x+box.width/2,cy=box.y+Math.min(170,box.height/2);
  await send('touchStart',[[1,cx-40,cy]]);await send('touchStart',[[1,cx-40,cy],[2,cx+40,cy]]);
  for(let i=1;i<=5;i++)await send('touchMove',[[1,cx-40-i*8,cy],[2,cx+40+i*8,cy]]);
  assert.equal(await page.locator('#paper-zoom-reset').textContent(),'200%');
  await send('touchEnd',[]);
  // Two-finger pan remains available; the leftover finger cannot start a new gesture.
  await send('touchStart',[[1,cx-40,cy],[2,cx+40,cy]]);await send('touchMove',[[1,cx-40,cy-60],[2,cx+40,cy-60]]);
  await send('touchEnd',[[1,cx-40,cy-60]]);await send('touchMove',[[1,cx-180,cy-60]]);await send('touchEnd',[]);
  assert.equal(await page.locator('#page-position').textContent(),'4 / 4');
  const zoomed=await paperView();
  await send('touchStart',[[1,cx,cy]]);await send('touchMove',[[1,cx+4,cy-60]]);await send('touchEnd',[]);
  const oneFinger=await paperView();
  assert.equal(oneFinger.scale,zoomed.scale);assert.equal(oneFinger.x,zoomed.x);assert.equal(oneFinger.y,zoomed.y-60);
  assert.equal(await page.locator('#page-position').textContent(),'4 / 4');
  const shell=await page.evaluate(()=>({top:document.querySelector('.editor-chrome').getBoundingClientRect().top,left:document.querySelector('.editor-chrome').getBoundingClientRect().left,scale:visualViewport.scale,scrollX,scrollY}));
  for(const key of Object.keys(shell))assert.equal(shell[key],original[key],key);
  // Pointer coordinate conversion after the paper has both zoomed and panned.
  const p=await page.locator('#canvas').boundingBox();
  const inkStart={x:cx,y:cy},inkEnd={x:cx+30,y:cy+20};
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:inkStart.x,y:inkStart.y,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:.5});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:inkEnd.x,y:inkEnd.y,button:'left',buttons:1,pointerType:'pen',force:.5});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:inkEnd.x,y:inkEnd.y,button:'left',buttons:0,clickCount:1,pointerType:'pen'});
  await page.waitForTimeout(450);
  const saved=await page.evaluate(async()=>{const {getNotes}=await import('/src/storage.js');return getNotes()});
  const ink=saved.find(n=>n.strokes.length)?.strokes[0];assert.ok(ink,'pen writes after zoom');
  assert.ok(Math.abs(ink.points[0].x-(inkStart.x-p.x)*900/p.width)<.1);
  assert.ok(Math.abs(ink.points[0].y-(inkStart.y-p.y)*1200/p.height)<.1);
  // Start directly on saved ink: scroll the paper without altering the strokes.
  const inkView=await paperView();
  await send('touchStart',[[1,inkStart.x,inkStart.y]]);await send('touchMove',[[1,inkStart.x,inkStart.y+40]]);await send('touchEnd',[]);
  assert.equal((await paperView()).y,inkView.y+40);
  const afterScroll=await page.evaluate(async()=>{const {getNotes}=await import('/src/storage.js');return getNotes()});
  assert.deepEqual(afterScroll,saved);
  if(process.env.NIB_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.NIB_SCREENSHOT_DIR,`nib-${width}-zoom.png`)});
  await page.locator('#paper-zoom-reset').click();
  assert.equal(await page.locator('#paper-zoom-reset').textContent(),'100%');
  if(process.env.NIB_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.NIB_SCREENSHOT_DIR,`nib-${width}-fixed.png`)});
  // Draw real objects through the UI, then erase both in one zoomed pen gesture.
  async function penDrag(from,to){
   const rect=await page.locator('#canvas').boundingBox();
   const a={x:rect.x+from.x*rect.width/900,y:rect.y+from.y*rect.height/1200};
   const b={x:rect.x+to.x*rect.width/900,y:rect.y+to.y*rect.height/1200};
   await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:.5});
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...b,button:'left',buttons:1,pointerType:'pen',force:.5});
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',buttons:0,clickCount:1,pointerType:'pen'});
  }
  await page.locator('#open-drawing').click();
  await page.locator('[data-drawing-tool="ellipse"]').click();
  await penDrag({x:100,y:100},{x:250,y:200});
  await page.waitForFunction(()=>document.querySelectorAll('#drawing-objects ellipse').length===1);
  await page.locator('[data-drawing-tool="table"]').click();
  await penDrag({x:100,y:400},{x:250,y:550});
  await page.waitForFunction(()=>document.querySelectorAll('#drawing-objects rect:not([pointer-events])').length===1);
  await page.locator('#drawing-rows').fill('2');
  await page.locator('#drawing-cols').fill('2');
  await page.locator('#drawing-cell-text').fill('테스트');
  await page.locator('#drawing-cell-set').click();
  await page.locator('#drawing-save').click();
  await page.waitForFunction(()=>document.querySelector('#drawing-objects').textContent.includes('테스트'));
  await page.locator('#eraser').click();
  assert.equal(await page.locator('#drawing-palette').isHidden(),true);
  await page.locator('#paper-zoom-in').click();
  await penDrag({x:175,y:150},{x:175,y:475});
  await page.waitForFunction(()=>document.querySelector('#drawing-objects').innerHTML==='');
  await page.locator('#undo').click();
  await page.waitForFunction(()=>document.querySelectorAll('#drawing-objects ellipse').length===1&&document.querySelectorAll('#drawing-objects rect').length===1);
  assert.ok((await page.locator('#drawing-objects').textContent()).includes('테스트'));
  await page.locator('#redo').click();
  await page.waitForFunction(()=>document.querySelector('#drawing-objects').innerHTML==='');
  await page.waitForTimeout(450);
  const erased=await page.evaluate(async()=>{const {getNotes}=await import('/src/storage.js');return getNotes()});
  const erasedPage=erased.find(n=>n.strokes.length);
  assert.equal(erasedPage.drawingObjects.length,0);
  assert.deepEqual(erasedPage.strokes,saved.find(n=>n.id===erasedPage.id).strokes);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('.app').inert);
  assert.equal(await page.locator('#page-position').textContent(),'4 / 4');
  assert.equal(await page.locator('#drawing-objects').innerHTML(),'');
  console.log('PASS',width,'drawing/table eraser with undo/redo and persistence, one-finger scroll, fixed shell, previous/next, pinch/pan, pen coordinates');
  await context.close();
 }
 assert.deepEqual(errors,[]);await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
