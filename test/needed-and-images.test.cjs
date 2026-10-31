const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { emptyCart, starterCart, migrateCart, applyChange, applyDetected, selectedUnits, neededQuantity, summarize, applyPriceRefresh } = require('../src/model.cjs');
const { extractThumbnail } = require('../src/lookup.cjs');
const { cartView } = require('../src/cart-view.cjs');
test('fresh launch is empty while previously saved starter or user data survives migration', () => {
  assert.deepEqual(emptyCart(), {schema:3, items:[]});
  const saved = starterCart(); assert.equal(migrateCart(saved).items.length, saved.items.length);
});
test('Needed parses decimal quantities and fractions with units; unknown and zero are explicit', () => {
  for (const [text,n] of [['1 Box',1],['3 boxes',3],['2.5 pounds',2.5],['1/2 lb',0.5],['',null],['a box',null],['0',null],['1/0',null]]) assert.equal(neededQuantity(text), n);
});
test('conversion sums every active store and alternative while preserving pricing and save/load', () => {
  const cart = emptyCart(); applyChange(cart, {type:'add-all',name:'Hot dogs'}); const root=cart.items[0];
  applyChange(cart, {type:'list-entry',id:root.id,requiredAmount:'1 Box'});
  for (const [i,store] of ['meijer','aldi','gfs'].entries()) {
    const url = {meijer:'https://www.meijer.com/shopping/product/1',aldi:'https://www.aldi.us/store/aldi/products/19517185-parkview-uncured-beef-franks-15-oz',gfs:'https://gfsstore.com/products/123/'}[store];
    applyDetected(cart,root.id,store,{url,candidates:[{product:store+' franks',cents:500,unitsTowardNeeded:i===2?10:1}]});
  }
  assert.equal(selectedUnits(cart,root.originId),12);
  assert.equal(cartView(cart,['meijer','aldi','gfs'],'meijer',false).rows[0].selectedUnits,12);
  assert.equal(cartView(cart,['meijer','aldi','gfs'],'all',true).rows[0].neededQuantity,1);
  assert.equal(summarize(cart,'gfs').cents,500);
  const gfs=cart.items[2], quote=gfs.priceOptions[0];
  applyChange(cart,{type:'offer',id:gfs.id,index:0,offer:{...quote,packs:3}});
  assert.equal(selectedUnits(cart,root.originId),12); assert.equal(summarize(cart,'gfs').cents,1500);
  applyPriceRefresh(cart,gfs.id,{...gfs.priceOptions[0]},{url:quote.url,candidates:[{product:quote.product,cents:600}]});
  assert.equal(gfs.priceOptions[0].unitsTowardNeeded,10);
  const restored=migrateCart(JSON.parse(JSON.stringify(cart))); assert.equal(selectedUnits(restored,root.originId),12);
  assert.equal(restored.items[0].requiredAmount,'1 Box');
  applyChange(cart,{type:'availability',id:gfs.id,available:false}); assert.equal(selectedUnits(cart,root.originId),2);
  applyChange(cart,{type:'empty-carts'}); assert.equal(selectedUnits(cart,root.originId),0); assert.equal(gfs.priceOptions[0].unitsTowardNeeded,10);
});
test('conversion defaults to one for legacy options, includes alternatives and rejects invalid values', () => {
  const cart=starterCart(), root=cart.items[0];
  for (const [index,n] of [1,2].entries()) applyChange(cart,{type:'offer',id:root.id,asAlternative:index>0,offer:{product:'Pack '+n,cents:100,packs:1,source:'manual',checked:'2026-10-31'}});
  applyChange(cart,{type:'option-quantity',id:root.id,index:1,quantity:2});
  assert.equal(selectedUnits(cart,root.originId),3);
  for (const value of [0,-1,Infinity,'10',1000001]) assert.throws(()=>applyChange(structuredClone(cart),{type:'offer',id:root.id,index:0,offer:{...root.priceOptions[0],unitsTowardNeeded:value}}));
});
function thumbnail(host, {products=[],meta=[],images=[],title='Parkview Uncured Beef Franks'}={}) {
  return vm.runInNewContext(`(${extractThumbnail.toString()})({candidates:[]})`,{URL,location:{href:host},document:{title,querySelectorAll:s=>s==='h1'?[{textContent:title,getClientRects:()=>[{}]}]:s.startsWith('script')?[{textContent:JSON.stringify(products)}]:s.startsWith('meta')?meta.map(content=>({getAttribute:()=>content})):(s==='img[alt]' || s.startsWith('main img'))?images.map(([alt,src])=>({getClientRects:()=>[{}],currentSrc:src,getAttribute:n=>n==='alt'?alt:src})):[]}});
}
const aldi='https://www.aldi.us/store/aldi/products/19517185-parkview-uncured-beef-franks-15-oz', img='https://d2lnr5mha7bycj.cloudfront.net/product-image.jpg';
test('ALDI structured URL identity, OG and dynamic labeled carousel fallbacks',()=>{
  assert.equal(thumbnail(aldi,{products:[{'@type':'Product',name:'Parkview Uncured Beef Franks 15 oz',url:aldi,image:{contentUrl:img}}]}).thumbnail,img);
  assert.equal(thumbnail(aldi,{meta:[img]}).thumbnail,img);
  assert.equal(thumbnail(aldi,{products:[{'@type':'Product',name:'Parkview Uncured Beef Franks',image:'https://example.com/missing-item.png'}],images:[['Parkview Uncured Beef Franks',img]]}).thumbnail,img);
  assert.equal(thumbnail(aldi,{images:[['Parkview Uncured Beef Franks',img],['Other franks','https://example.com/other.jpg']]}).thumbnail,img);
  assert.equal(thumbnail(aldi,{images:[['Other franks',img]]}).thumbnail,'');
  assert.equal(thumbnail(aldi,{images:[['Parkview Uncured Beef Franks',img],['Parkview Uncured Beef Franks',img+'?other']]}).thumbnail,'');
});
test('GFS gallery fallback, blocked pages and non-product pages remain safe',()=>{
  assert.equal(thumbnail('https://gfsstore.com/products/123/',{title:'Beef Franks',images:[['Beef Franks',img]]}).thumbnail,img);
  assert.equal(thumbnail('https://www.aldi.us/store/aldi/s',{images:[['Parkview Uncured Beef Franks',img]]}).thumbnail,'');
});
