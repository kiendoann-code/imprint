import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const client = fs.readFileSync(new URL('../src/client-api.js', import.meta.url), 'utf8');
const marker = '/* ImPrint cart safety:';
const guard = client.slice(client.indexOf(marker));
assert.ok(guard.startsWith(marker), 'cart guard must be included in client-api.js');

function boot(items=[], persist=async()=>{}) {
  const rows={toolbar:null,prepend(v){this.toolbar=v}};
  const state={
    document:{
      querySelector:()=>({disabled:false,isConnected:true,textContent:''}),
      createElement:tag=>({tag,style:{},children:[],appendChild(v){this.children.push(v)},addEventListener(event,fn){this[event]=fn}})
    },
    app:{querySelector:()=>rows},
    data:{cart:items,products:[{id:'tee',stock:100}]},
    draft:{id:'design-123'},editCartId:null,location:{hash:'#studio'},
    $:id=>id==='#rights'?{checked:true}:null,
    uid:()=> 'new-'+ ++state.n, n:0,
    go:route=>{state.location.hash='#'+route},
    updateHeader:()=>{state.headerCount++},headerCount:0,
    toast:()=>{}, confirm:()=>true,
    persist,
    confirmDesign:async()=>{
      if(!state.data.cart.some(i=>i.id===state.editCartId))state.data.cart.push({id:state.editCartId,design:{id:'design-123'}});
      await state.persist();state.editCartId=null;state.go('cart');
    },
    addPlain:async()=>{state.data.cart.push({id:'plain-'+ ++state.n});await state.persist();state.go('cart')},
    removeItem:()=>{}, quantity:()=>{}, cart:()=>{}, checkout:()=>{}
  };
  vm.createContext(state);
  vm.runInContext(guard,state);
  return {state,rows};
}

test('rapid confirmations are idempotent',async()=>{
  let release;
  const {state}=boot([],()=>new Promise(resolve=>{release=resolve}));
  const first=state.confirmDesign(),second=state.confirmDesign();
  assert.equal(state.data.cart.length,1);
  release();await Promise.all([first,second]);
  await state.confirmDesign();
  assert.equal(state.data.cart.length,1);
});

test('retry after a failed confirmation reuses the same cart ID',async()=>{
  let attempts=0;
  const {state}=boot([],async()=>{if(++attempts===1)throw Error('offline')});
  await assert.rejects(state.confirmDesign());
  const id=state.data.cart[0].id;
  await state.confirmDesign();
  assert.equal(state.data.cart.length,1);
  assert.equal(state.data.cart[0].id,id);
});

test('removing a row updates visible cart before the server responds',()=>{
  const {state}=boot([{id:'1',qty:1,product:{id:'tee'}}],()=>new Promise(()=>{}));
  state.location.hash='#cart';
  state.removeItem('1');
  assert.equal(state.data.cart.length,0);
  assert.equal(state.headerCount,1);
});

test('bulk cleanup distinguishes repeated designs from intentional plain items',()=>{
  const design={id:'d1',productId:'tee',layers:[{type:'text',text:'Hi'}]};
  const line=(id,d)=>({id,product:{id:'tee'},color:'Trắng',size:'M',model:'f',design:d});
  const {state,rows}=boot([line('a',design),line('b',structuredClone(design)),line('c',null),line('d',null)]);
  state.location.hash='#cart';state.cart();
  assert.equal(rows.toolbar.children[0].textContent,'Dọn 1 sản phẩm trùng');
  rows.toolbar.children[0].click();
  assert.deepEqual(state.data.cart.map(x=>x.id),['a','c','d']);
  state.cart();
  rows.toolbar.children.at(-1).click();
  assert.equal(state.data.cart.length,0);
});
