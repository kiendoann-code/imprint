import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/backend.mjs';
import {handleBehavior,recordBehaviorConversion} from '../src/user-behavior.mjs';
import {environment} from './harness.mjs';
import fs from 'node:fs';

const ORIGIN='https://imprint.test';
function request(path,method='GET',payload){
  return new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
}
function sample(visitorId=crypto.randomUUID()){
  return {sessionId:crypto.randomUUID(),visitorId,pageViews:1,engagedMs:0,scrollDepth:0,interactions:0};
}
test('anonymous events, 7/30/90 ranges, privacy and order conversion',async()=>{
  const env=environment();
  const guestA=sample();
  const a=await worker.fetch(request('/api/behavior','POST',guestA),env,{});
  assert.equal(a.status,202);
  const guestB=sample(guestA.visitorId);
  assert.equal((await worker.fetch(request('/api/behavior','POST',{...guestB,engagedMs:20000,scrollDepth:80,interactions:2}),env,{})).status,202);
  await recordBehaviorConversion(env.DB,guestB.sessionId);
  const admin={role:'admin'};
  let r=await handleBehavior(request('/api/admin/behavior?days=7'),env,admin);
  let report=await r.json();
  assert.equal(report.kpis.sessions,2);
  assert.equal(report.kpis.visitors,1);
  assert.equal(report.kpis.conversions,1);
  assert.equal(report.kpis.bounceRate,50);
  assert.equal(report.kpis.conversionRate,50);
  assert.equal(report.kpis.avgScrollDepth,40);
  assert.equal(report.kpis.avgSessionSeconds,10);
  assert.equal(report.kpis.pagesPerSession,1);
  const old=sample();
  await env.DB.prepare('INSERT INTO behavior_sessions(session_id,visitor_id,started_at,updated_at,page_views) VALUES(?,?,?,?,1)')
    .bind(old.sessionId,old.visitorId,Date.now()-15*86400000,Date.now()-15*86400000).run();
  r=await handleBehavior(request('/api/admin/behavior?days=7'),env,admin);
  assert.equal((await r.json()).kpis.sessions,2);
  r=await handleBehavior(request('/api/admin/behavior?days=30'),env,admin);
  assert.equal((await r.json()).kpis.sessions,3);
  r=await handleBehavior(request('/api/admin/behavior?days=90'),env,admin);
  assert.equal((await r.json()).kpis.sessions,3);
  assert.equal((await worker.fetch(request('/api/admin/behavior?days=7'),env,{})).status,403);
  await assert.rejects(handleBehavior(request('/api/admin/behavior?days=31'),env,admin),{status:400});
  assert.equal((await worker.fetch(request('/api/behavior','POST',{...sample(),email:'ignored@example.test'}),env,{})).status,202);
  const fields=env.db.prepare('PRAGMA table_info(behavior_sessions)').all().map(c=>c.name);
  assert(!fields.includes('email'));
  const invalid=await worker.fetch(request('/api/behavior','POST',{...sample(),engagedMs:999999999}),env,{});
  assert.equal(invalid.status,400);
  env.db.close();
});


test('cart add events are idempotent and historic D1 orders remain separate from session analytics',async()=>{
  const env=environment(),guest=sample(),admin={role:'admin'};
  assert.equal((await worker.fetch(request('/api/behavior','POST',guest),env,{})).status,202);
  const add={eventType:'add_to_cart',eventId:crypto.randomUUID(),sessionId:guest.sessionId,visitorId:guest.visitorId};
  assert.equal((await worker.fetch(request('/api/behavior','POST',add),env,{})).status,202);
  assert.equal((await worker.fetch(request('/api/behavior','POST',add),env,{})).status,202);
  const second={...add,eventId:crypto.randomUUID()};
  assert.equal((await worker.fetch(request('/api/behavior','POST',second),env,{})).status,202);
  const invalid={...add,eventId:'not-uuid'};
  assert.equal((await worker.fetch(request('/api/behavior','POST',invalid),env,{})).status,400);
  const userId=crypto.randomUUID(),old=Date.now()-20*86400000;
  env.db.prepare('INSERT INTO users(id,email,name,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run(userId,'past-buyer@example.test','Khách cũ','salt','hash',old);
  env.db.prepare('INSERT INTO orders(id,user_id,request_key,body,status,created_at) VALUES(?,?,?,?,?,?)')
    .run('ORDER-OLD',userId,'historic-order-001','{}',5,old);
  const body=await (await handleBehavior(request('/api/admin/behavior?days=30'),env,admin)).json();
  assert.equal(body.kpis.sessions,1);
  assert.equal(body.kpis.addToCart,2);
  assert.equal(body.historicalOrders.orders,1);
  assert.equal(body.historicalOrders.buyers,1);
  assert.equal(body.historicalOrders.daily.length,1);
  const week=await (await handleBehavior(request('/api/admin/behavior?days=7'),env,admin)).json();
  assert.equal(week.historicalOrders.orders,0);
  assert.equal(week.kpis.addToCart,2);
  env.db.close();
});

test('Cloudflare CSV backfill stores verified aggregates separately and is admin-only',async()=>{
  const env=environment(),admin={role:'admin'};
  const date=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const source={source:'cloudflare',rows:[{day:date,visitors:23,pageViews:78}]};
  assert.equal((await worker.fetch(request('/api/admin/behavior/import-history','POST',source),env,{})).status,403);
  const r=await handleBehavior(request('/api/admin/behavior/import-history','POST',source),env,admin);
  assert.equal(r.status,200);
  assert.equal((await r.json()).imported,1);
  // Idempotent upsert: reimport should replace the same day, not duplicate it.
  await handleBehavior(request('/api/admin/behavior/import-history','POST',source),env,admin);
  const report=await(await handleBehavior(request('/api/admin/behavior?days=30'),env,admin)).json();
  assert.equal(report.importedAnalytics.importedDays,1);
  assert.equal(report.importedAnalytics.pageViews,78);
  assert.equal(report.importedAnalytics.dailyVisitors,23);
  assert.equal(report.kpis.sessions,0);
  assert.equal(report.kpis.visitors,0);
  assert.equal(report.kpis.addToCart,0);
  await assert.rejects(handleBehavior(request('/api/admin/behavior/import-history','POST',
    {source:'cloudflare',rows:[{day:'2020-01-01',visitors:1,pageViews:1}]}),env,admin),{status:400});
  await assert.rejects(handleBehavior(request('/api/admin/behavior/import-history','POST',
    {source:'cloudflare',rows:[{day:date,visitors:-1,pageViews:1}]}),env,admin),{status:400});
  env.db.close();
});

test('admin behavior client parses as valid JavaScript with an ImPrint-matching palette',()=>{
  const source=fs.readFileSync('src/behavior-client.js','utf8');
  assert.doesNotThrow(()=>new Function(source));
  assert.match(source,/ip-behavior-import/);
  assert.match(source,/background:#fffdfa/);
  assert.match(source,/data-value/);
  assert.match(source,/ignoreNextCartPersist/);
});
