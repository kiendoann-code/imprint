import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/admin-color-picker.js',import.meta.url),'utf8');

function createUI(){
  const mint={id:'mint',colors:['Xanh mint'],colorHexes:{'Xanh mint':'#a8d8c8'}};
  const teal={id:'teal',colors:['Xanh mint'],colorHexes:{'Xanh mint':'#12a4a7'}};
  const context={
    document:{createElement(){return {id:'',textContent:''};},head:{appendChild(){}}},
    data:{products:[mint,teal]},draft:null,chosen:{id:'mint'},user:null,
    colorHex(){return '#eeeeee';},card:null,productForm(){},saveProduct(){},
  };
  context.card=p=>context.colorHex(p.colors[0]);
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'admin-color-picker.js'});
  return {context,mint,teal};
}

test('Colour picker script loads and resolves saved HEX for current product',()=>{
  const {context}=createUI();
  assert.equal(context.colorHex('Xanh mint'),'#a8d8c8');
  context.chosen={id:'teal'};
  assert.equal(context.colorHex('Xanh mint'),'#12a4a7');
});

test('Product cards display per-product HEX even when names match',()=>{
  const {context,mint,teal}=createUI();
  assert.equal(context.card(mint),'#a8d8c8');
  assert.equal(context.card(teal),'#12a4a7');
  assert.equal(context.colorHex('Xanh mint'),'#a8d8c8');
});

test('Studio draft takes priority and invalid HEX is never used as CSS',()=>{
  const {context,teal}=createUI();
  context.draft={productId:teal.id};
  assert.equal(context.colorHex('Xanh mint'),'#12a4a7');
  teal.colorHexes['Xanh mint']='red;background:url(javascript:evil)';
  assert.equal(context.colorHex('Xanh mint'),'#a8d8c8');
});