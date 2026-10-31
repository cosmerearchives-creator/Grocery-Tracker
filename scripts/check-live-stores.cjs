const {app,BrowserWindow}=require('electron');
const {extractScript}=require('../src/lookup.cjs');
const fs=require('node:fs/promises');
app.setPath('userData',require('node:path').join(require('node:os').tmpdir(),'grocery-live-'+process.pid));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const keepAlive = new BrowserWindow({show:false});
 const results=[];
 for(const url of ['https://www.aldi.us/store/aldi/products/19517185-parkview-uncured-beef-franks-15-oz','https://www.meijer.com/shopping/product/meijer-whole-milk-gallon/4125010200','https://gfsstore.com/products/781342/']){
 console.log('Checking '+url);
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});
 try{await Promise.race([w.loadURL(url),new Promise((_,reject)=>setTimeout(()=>reject(Error('Load timed out')),22000))]);await new Promise(r=>setTimeout(r,5000));const result=await w.webContents.executeJavaScript(extractScript); const images=await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('img')).slice(0,20).map(n=>({alt:n.alt,src:n.currentSrc,main:!!n.closest('main')}))`);results.push({url,result,images}); console.log(JSON.stringify({url,result}));}catch(e){results.push({url,error:e.message})}finally{await fs.writeFile('test-results/live-stores.json',JSON.stringify(results,null,2)); w.destroy()}
 }
 await fs.writeFile('test-results/live-stores.json',JSON.stringify(results,null,2)); console.log(JSON.stringify(results));app.exit(0);
});
