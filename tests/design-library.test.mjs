import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleDesignLibrary} from '../src/design-library.mjs';
const ORIGIN='https://imprint.test';
const ASSET1='11111111-1111-4111-8111-111111111111';
const ASSET2='22222222-2222-4222-8222-222222222222';
const makeEnv=()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`CREATE TABLE assets (id TEXT PRIMARY KEY,owner TEXT,object_key TEXT,type TEXT,size INTEGER, public INTEGER,metadata TEXT,created_at INTEGER)`);
 sqlite.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').run(ASSET1,'site-owner','uploads/'+ASSET1,'image/png',3,1,'{}',Date.now());
 sqlite.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').run(ASSET2,'site-owner','uploads/'+ASSET2,'image/png',3,0,'{}',Date.now());
 const DB={prepare(sql){return{bind(...args){return{async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:r.changes}}},async all(){return{results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)||null}}}}}};
 const BUCKET={async put(){},async delete(){}};return {DB,BUCKET,sqlite};
};
async function call(env,path,method='GET',body,role){const headers={'content-type':'application/json'};const req=new Request(ORIGIN+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});try{return await handleDesignLibrary(req,env,role?{role,id:'site-owner'}:null)}catch(e){return new Response(JSON.stringify({error:e.message}),{status:e.status||500})}}
test('admin design library CRUD, private media rejected, no hard deletion',async()=>{
 const env=makeEnv();const item={name:'ImPrint mascot',category:'Art',mediaId:ASSET1,alt:'Thỏ',position:1};
 let r=await call(env,'/api/admin/design-library','POST',item);assert.equal(r.status,403);
 r=await call(env,'/api/admin/design-library','POST',{...item,mediaId:ASSET2},'admin');assert.equal(r.status,400);
 r=await call(env,'/api/admin/design-library','POST',item,'admin');assert.equal(r.status,201);let {item:created}=await r.json();
 let pub=await(await call(env,'/api/design-library')).json();assert.equal(pub.items.length,1);
 r=await call(env,'/api/admin/design-library/'+created.id,'PATCH',{revision:1,name:'Mascot v2',enabled:false},'admin');assert.equal(r.status,200);
 assert.equal((await(await call(env,'/api/design-library')).json()).items.length,0);
 assert.equal((await call(env,'/api/admin/design-library/'+created.id,'PATCH',{revision:1,name:'stale'},'admin')).status,409);
 r=await call(env,'/api/admin/design-library/'+created.id,'DELETE',{revision:2},'admin');assert.equal(r.status,200);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) as n FROM design_library_items').get().n,1);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) as n FROM assets').get().n,2);
 r=await call(env,'/api/admin/design-library/'+created.id,'PATCH',{revision:3,archived:false,enabled:true},'admin');assert.equal(r.status,200);
 assert.equal((await(await call(env,'/api/design-library')).json()).items.length,1);env.sqlite.close();
});
test('vector upload permits safe SVG and rejects unsafe markup',async()=>{
 const env=makeEnv();async function upload(svg){const buf=new TextEncoder().encode(svg);const req=new Request(ORIGIN+'/api/admin/design-library/upload',{method:'POST',headers:{'content-type':'image/svg+xml','content-length':String(buf.length)},body:buf});try{return await handleDesignLibrary(req,env,{role:'admin',id:'site-owner'})}catch(e){return new Response('{}',{status:e.status||500})}}
 let r=await upload('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10"/></svg>');assert.equal(r.status,201);
 r=await upload('<svg onload="alert(1)"><path d="M0 0"/></svg>');assert.equal(r.status,400);
 r=await upload('<svg><foreignObject><script>alert(1)</script></foreignObject></svg>');assert.equal(r.status,400);
 env.sqlite.close();
});