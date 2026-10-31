// Run with: pnpm exec electron scripts/validate-ui.cjs
// Uses an isolated temporary profile and controlled retailer pages, never real user data.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const handlers = new Map(), original = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, callback) => { handlers.set(name, callback); original(name, callback); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const output = path.resolve('test-results');
const profile = path.join(os.tmpdir(), `grocery-ui-${process.pid}`);
app.setPath('userData', profile);
const invoke = (window, name, ...args) => handlers.get(name)({ sender:window.webContents, senderFrame:window.webContents.mainFrame }, ...args);
async function until(check) { for(let i=0;i<150;i++){ const value=await check(); if(value)return value; await sleep(100); } throw Error('Timed out waiting for UI'); }
async function evaluate(window, code) { return window.webContents.executeJavaScript(code, true); }
app.whenReady().then(async()=>{
  await fs.mkdir(output,{recursive:true});
  const html = '<main style="height:3000px"><h1>Parkview Uncured Beef Franks</h1><img alt="Parkview Uncured Beef Franks" src="https://images.example/franks.png"><script type="application/ld+json">{"@type":"Product","name":"Parkview Uncured Beef Franks","offers":{"priceCurrency":"USD","price":"5.25"}}</script></main>';
  for(const store of ['meijer','aldi','gfs']) await session.fromPartition(`persist:store-${store}`).protocol.handle('https',()=>new Response(html,{headers:{'content-type':'text/html'}}));
  require('../src/main.cjs');
  const main = await until(()=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Grocery Tracker'));
  await until(()=>handlers.has('load') && !main.webContents.isLoading());
  await until(()=>evaluate(main,"document.getElementById('version').textContent"));
  assert.equal((await invoke(main,'load')).cart.items.length,0);
  await invoke(main,'change',{type:'add-all',name:'Beef Hot Dogs, 8 Count'});
  let cart=(await invoke(main,'load')).cart, id=cart.items[0].id;
  await invoke(main,'change',{type:'list-entry',id,requiredAmount:'1 Box'});
  for(const [i,store] of ['meijer','aldi','gfs'].entries()) {
    const row=cart.items.find(i=>i.store===store);
    await invoke(main,'change',{type:'offer',id:row.id,offer:{product:['Ball Park Beef Hot Dogs, 8 Count','Parkview Uncured Beef Franks 15 oz','Gordon Choice Beef Franks, Bulk Case of Ten Packs'][i],cents:500,packs:1,unitsTowardNeeded:i===2?10:1,source:'manual',checked:'2026-10-31',thumbnail:'https://images.example/franks.png'}});
  }
  await evaluate(main,"selectStore('all')");
  await until(()=>evaluate(main,"document.querySelector('.cart-counter')?.textContent === 'Cart: 12/1'"));
  assert.equal(await evaluate(main,"document.querySelectorAll('.store-option').length"),3);
  await evaluate(main,"const amount=document.querySelector('.needed-label input'); amount.value='2 boxes'; amount.dispatchEvent(new Event('input'));");
  assert.equal(await evaluate(main,"document.querySelector('.cart-counter').textContent"),'Cart: 12/2');
  await evaluate(main,"document.querySelector('.needed-label input').value='1 Box'; document.querySelector('.needed-label input').dispatchEvent(new Event('input'));");
  await evaluate(main,"document.querySelector('.product-name').click()");
  assert.equal(await evaluate(main,"document.getElementById('offer-units').value"),'1');
  await evaluate(main,"document.getElementById('close-price').click()");
  const compactHeight=await evaluate(main,"document.querySelector('.item').getBoundingClientRect().height");
  await sleep(700); await fs.writeFile(path.join(output,'compact.png'),(await main.webContents.capturePage()).toPNG());
  const headerSizes = [];
  for (const width of [1920, 1360, 980]) {
    main.setSize(width, 930); await sleep(350);
    const metrics = await evaluate(main, `(() => {
      const header=document.querySelector('header'), bounds=header.getBoundingClientRect();
      const sections=[...header.children].map(n=>n.getBoundingClientRect());
      return {windowWidth:innerWidth, headerWidth:bounds.width, headerHeight:bounds.height,
        overflow:document.documentElement.scrollWidth>innerWidth,
        overlap:sections.some((r,i)=>i && r.left<sections[i-1].right),
        clippedControls:[...header.querySelectorAll('button,select,input')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.id)};
    })()`);
    assert.ok(metrics.headerWidth<=720); assert.equal(metrics.overflow,false);
    assert.equal(metrics.overlap,false); assert.deepEqual(metrics.clippedControls,[]);
    headerSizes.push(metrics);
    if(width===1360) await fs.writeFile(path.join(output,'compact-header.png'),(await main.webContents.capturePage()).toPNG());
  }
  main.setSize(1360,930); await sleep(200);
  await fs.writeFile(path.join(output,'header-report.json'),JSON.stringify(headerSizes,null,2));
  await invoke(main,'open-store','aldi');
  const shell=await until(()=>BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('Stores')));
  await until(()=>!shell.webContents.isLoading());
  const view=shell.contentView.children[0];
  const url='https://www.aldi.us/store/aldi/products/19517185-parkview-uncured-beef-franks-15-oz';
  await view.webContents.loadURL(url); await view.webContents.executeJavaScript('scrollTo(0,600)');
  const scroll=await view.webContents.executeJavaScript('scrollY');
  const preview=await invoke(shell,'store-tab-preview-new');
  await invoke(shell,'store-tab-review-new',preview.token);
  let review=await until(()=>BrowserWindow.getAllWindows().find(w=>w.getParentWindow()===shell));
  await until(()=>evaluate(review,"document.getElementById('import-dialog').open"));
  assert.equal(review.isModal(),true); assert.equal(shell.isVisible(),true); assert.equal(shell.isMinimized(),false);
  await fs.writeFile(path.join(output,'browser-modal.png'),(await review.webContents.capturePage()).toPNG());
  await evaluate(review,"document.getElementById('cancel-link').click()");
  await until(()=>review.isDestroyed()); assert.equal(await view.webContents.executeJavaScript('scrollY'),scroll); assert.equal(view.webContents.getURL(),url);
  await invoke(shell,'store-tab-review-new',preview.token);
  review=await until(()=>BrowserWindow.getAllWindows().find(w=>w.getParentWindow()===shell));
  await until(()=>evaluate(review,"document.getElementById('import-dialog').open"));
  await evaluate(review,"document.getElementById('import-name').value='Uncured Beef Franks'; document.getElementById('confirm-link').click()");
  await until(()=>review.isDestroyed());
  assert.equal(await view.webContents.executeJavaScript('scrollY'),scroll); assert.equal(view.webContents.getURL(),url);
  assert.equal((await invoke(main,'load')).cart.items.filter(i=>i.name==='Uncured Beef Franks').length,1);
  // Reload the prior renderer for a like-for-like card height comparison.
  const baseline=path.join(output,'baseline'); await fs.mkdir(baseline,{recursive:true});
  for(const name of ['index.html','renderer.js','style.css']) await fs.writeFile(path.join(baseline,name),execFileSync('git',['show',`v0.12.0:src/${name}`]));
  await main.loadFile(path.join(baseline,'index.html')); await until(()=>evaluate(main,"!!document.querySelector('.item')" ).catch(()=>false));
  await evaluate(main,"selectStore('all')"); await sleep(300);
  const baselineHeight=await evaluate(main,"document.querySelector('.item').getBoundingClientRect().height");
  const reduction=1-compactHeight/baselineHeight;
  assert.ok(reduction>=0.35,`Only ${reduction*100}% height reduction`);
  const report={compactHeight,baselineHeight,reductionPercent:Math.round(reduction*100),profile,checks:'empty launch, three columns, live Needed, conversion fields, native browser modal cancel/submit, preserved URL/scroll, isolated persisted data'};
  assert.equal(JSON.parse(await fs.readFile(path.join(profile,'cart.json'),'utf8')).items[0].requiredAmount,'1 Box');
  await fs.writeFile(path.join(output,'ui-report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report)); app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});


