import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleDesignLibrary} from '../src/design-library.mjs';
import {BUILTIN_VECTORS} from '../src/design-library-vectors.mjs';

const ORIGIN='https://imprint.test';
function makeEnv(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE assets (id TEXT PRIMARY KEY,owner TEXT,object_key TEXT,type TEXT,size INTEGER,public INTEGER,metadata TEXT,created_at INTEGER)');
 const DB={prepare(sql){return{bind(...args){return{
  async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:r.changes}}},
  async all(){return{results:sqlite.prepare(sql).all(...args)}},
  async first(){return sqlite.prepare(sql).get(...args)||null}
 }}}}};
 const objects=new Map(),BUCKET={async put(key,bytes){objects.set(key,bytes)},async delete(key){objects.delete(key)}};
 return{DB,BUCKET,objects,sqlite,BUILTIN_VECTOR_PACK:true};
}
async function req(env,path,method='GET',payload,role=null){
 const headers=payload===undefined?{}:{'content-type':'application/json'};
 const request=new Request(ORIGIN+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
 return handleDesignLibrary(request,env,role);
}
test('10 real editable SVG assets registered as public Vector items in R2 and D1',async()=>{
 const env=makeEnv();
 try{
  assert.equal(BUILTIN_VECTORS.length,10);
  const result=await req(env,'/api/design-library');
  assert.equal(result.status,200);
  const {items}=await result.json();
  assert.equal(items.length,10);
  assert.equal(new Set(items.map(x=>x.id)).size,10);
  assert.equal(new Set(items.map(x=>x.mediaId)).size,10);
  assert(items.every(x=>x.category==='Vector'&&x.enabled===true&&x.archived===false));
  assert(items.every(x=>x.url==='/api/files/'+x.mediaId));
  assert.equal(env.objects.size,10);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM assets WHERE type=? AND public=1').get('image/svg+xml').n,10);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM design_library_packs').get().n,1);
  for(const vector of BUILTIN_VECTORS){
   const stored=env.objects.get('uploads/'+vector.assetId);
   assert(stored,vector.filename+' missing R2 bytes');
   const xml=new TextDecoder().decode(stored);
   assert(xml.startsWith('<svg '),vector.filename);
   assert(xml.includes('width="512" height="512"'),vector.filename+' must render in bitmap editor');
   assert.match(xml,/<path /);
   assert.doesNotMatch(xml,/<(?:script|foreignObject|image)|\bonload=|\bhref=|url\s*\(/i);
  }
 }finally{env.sqlite.close()}
});
test('GET is idempotent and customer archive does not resurrect removed vectors',async()=>{
 const env=makeEnv();
 try{
  const first=(await(await req(env,'/api/design-library')).json()).items;
  assert.equal(first.length,10);
  const asset=first[0];
  const archived=await req(env,'/api/admin/design-library/'+asset.id,'DELETE',{revision:asset.revision},{role:'admin',id:'site-owner'});
  assert.equal(archived.status,200);
  for(let i=0;i<2;i++){
   const publicItems=(await(await req(env,'/api/design-library')).json()).items;
   assert.equal(publicItems.length,9);
   assert(!publicItems.some(x=>x.id===asset.id));
  }
  assert.equal(env.objects.size,10);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM design_library_items').get().n,10);
  const adminList=(await(await req(env,'/api/admin/design-library','GET',undefined,{role:'admin',id:'site-owner'})).json()).items;
  assert.equal(adminList.length,10);
  assert(adminList.some(x=>x.id===asset.id&&x.archived===true));
 }finally{env.sqlite.close()}
});
