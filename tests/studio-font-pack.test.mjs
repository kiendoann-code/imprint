import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/studio-font-pack.js',import.meta.url),'utf8');
const added=[...source.matchAll(/\{name:'([^']+)',group:'([^']+)',fallback:'([^']+)'/g)].map(x=>x[1]);
const legacy=['Lora','Playfair Display','Dancing Script','Patrick Hand','Be Vietnam Pro','Arial','Georgia','Verdana','Tahoma','Trebuchet MS','Courier New','Times New Roman'];

test('adds 20 unique font families to 12 existing families without changing originals',()=>{
  assert.equal(added.length,20);assert.equal(new Set(added).size,20);
  assert.equal(added.filter(x=>legacy.includes(x)).length,0);
  assert.match(source,/Những điều dịu dàng/);
  assert.match(source,/Tiếng Việt Ắ Ế Ở Ữ Đ/);
});

function mockDom(){
  const handlers=new Map();let mutationCallback=()=>{};
  class Element {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style={};this.hidden=false;this.value='';this.type='';this.className='';this.id='';this.parentElement=null;this.events={};this.options=[];this.tabIndex=0;this.textContent='';}
    append(...nodes){for(const n of nodes)this.appendChild(n)}
    appendChild(n){if(n.parentElement){const i=n.parentElement.children.indexOf(n);if(i>=0)n.parentElement.children.splice(i,1)}this.children.push(n);n.parentElement=this;return n}
    replaceChildren(...nodes){for(const n of this.children)n.parentElement=null;this.children=[];this.append(...nodes)}
    insertAdjacentElement(where,n){assert.equal(where,'afterend');if(!this.parentElement)throw Error('detached');const siblings=this.parentElement.children;const at=siblings.indexOf(this);siblings.splice(at+1,0,n);n.parentElement=this.parentElement;}
    add(option){this.options.push(option)}
    setAttribute(key,val){this.attributes[key]=String(val)}
    getAttribute(key){return this.attributes[key]}
    addEventListener(type,fn){(this.events[type]||=[]).push(fn)}
    dispatchEvent(ev){for(const fn of this.events[ev.type]||[])fn(ev);return true}
    click(){this.dispatchEvent({type:'click',target:this})}
    focus(){document.activeElement=this}
    scrollIntoView(){}
    contains(el){if(this===el)return true;return this.children.some(n=>n.contains(el))}
    get classList(){return {add:name=>this.className=[...new Set([...this.className.split(' ').filter(Boolean),name])].join(' ')}}
    querySelectorAll(selector){const matches=[];const visit=(node)=>{for(const c of node.children){if(match(c,selector))matches.push(c);visit(c)}};visit(this);return matches}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  }
  function match(el,s){
    if(s==='.ip-font-option')return el.className.split(' ').includes('ip-font-option');
    if(s==='.ip-font-option[aria-selected="true"]')return el.className.split(' ').includes('ip-font-option')&&el.getAttribute('aria-selected')==='true';
    const custom=s.match(/^\[data-ip-vi-font="(.+)"\]$/);return custom?el.dataset.ipViFont===custom[1]:false;
  }
  const document={readyState:'loading',body:new Element('body'),head:new Element('head'),createElement(tag){return new Element(tag)},
    addEventListener(type,fn){(handlers.get(type)||handlers.set(type,[]).get(type)).push(fn)},
    getElementById(id){if(id==='fontSelect')return document.select||null;return [...document.head.children,...document.body.children].find(e=>e.id===id)||null},
    querySelectorAll(sel){return sel==='.font-library'?[document.library]:[]},activeElement:null,
    fonts:{load(){return Promise.resolve([{}])}}};
  document.library=new Element('div');document.library.className='font-library';document.body.appendChild(document.library);
  const select=new Element('select');select.id='fontSelect';select.options=legacy.map(x=>({value:x,text:x}));select.value='Arial';document.body.appendChild(select);document.select=select;
  const originalChanges=[];
  select.addEventListener('change',()=>originalChanges.push(select.value));
  const chosen=[];
  const window={addEventListener(){},addText:family=>chosen.push(family)};
  const ctx={document,window,URL,Option:class{constructor(t,v){this.text=t;this.value=v}},Event:class{constructor(type){this.type=type}},MutationObserver:class{constructor(cb){mutationCallback=cb}observe(){}},requestAnimationFrame:cb=>cb(),addText:family=>chosen.push(family),console};
  vm.runInNewContext(source,ctx,{filename:'studio-font-pack.js'});
  for(const fn of handlers.get('DOMContentLoaded')||[])fn();
  return {document,select,library:document.library,chosen,originalChanges,mutation:()=>mutationCallback()};
}

test('native select retains existing options, adds 20 and shows styled visual names',()=>{
  const {document,select}=mockDom();
  assert.equal(select.options.length,32);
  assert.equal(select.options[0].value,'Lora');
  const ui=document.body.children.find(n=>n.className==='ip-font-combobox');assert(ui);
  const trigger=ui.children[0],menu=ui.children[1];assert.equal(menu.hidden,true);
  trigger.click();assert.equal(menu.hidden,false);
  const options=menu.children[1].querySelectorAll('.ip-font-option');assert.equal(options.length,32);
  const pacifico=options.find(x=>x.dataset.font==='Pacifico');assert.match(pacifico.children[0].style.fontFamily,/Pacifico/);
  assert.equal(pacifico.children[0].textContent,'Pacifico');
  assert.match(document.head.children.find(x=>x.id==='ip-vi-font-css').href,/fonts.googleapis.com/);
});

test('selecting new font dispatches legacy change event and keeps native state',()=>{
  const {document,select,originalChanges}=mockDom();
  const ui=document.body.children.find(n=>n.className==='ip-font-combobox');ui.children[0].click();
  const menu=ui.children[1];const target=menu.children[1].querySelectorAll('.ip-font-option').find(x=>x.dataset.font==='Bitter');
  target.click();assert.equal(select.value,'Bitter');assert.equal(originalChanges.at(-1),'Bitter');
  assert.equal(menu.hidden,true);assert.match(ui.children[0].children[0].style.fontFamily,/Bitter/);
});

test('new font cards call original addText and are not duplicated after re-render',()=>{
  const {library,chosen,mutation}=mockDom();
  assert.equal(library.children.length,20);
  const button=library.children.find(x=>x.dataset.ipViFont==='Lobster');button.click();
  assert.equal(chosen.at(-1),'Lobster');
  mutation();assert.equal(library.children.length,20);
  assert.equal(button.children[1].textContent,'Những điều dịu dàng');
});