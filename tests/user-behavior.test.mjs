import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/backend.mjs';
import {handleBehavior,recordBehaviorConversion} from '../src/user-behavior.mjs';
import {salesAnalytics} from '../src/admin-sales.mjs';
import {readRecoveredRows} from '../src/recovered-orders.mjs';
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

test('behavior orders and buyer profiles match business report including recovered orders, same date range and ID deduplication',async()=>{
  const env=environment(),admin={role:'admin'};
  const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const placed=today+'T09:15:00+07:00',when=Date.parse(placed);
  const customer='legacy-source@example.com';
  const userId=crypto.randomUUID();
  env.db.prepare('INSERT INTO users(id,email,name,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run(userId,'buyer@test.local','Người mua','salt','hash',when);
  const order={id:'ACTIVE-01',owner:'buyer@test.local',status:5,items:[],sub:205000,discount:0,total:205000};
  env.db.prepare('INSERT INTO orders(id,user_id,request_key,body,status,created_at) VALUES(?,?,?,?,?,?)')
    .run(order.id,userId,'unique-checkout-key',JSON.stringify(order),5,when);
  // Creates archival tables before placing records. Archive stays read-only.
  await readRecoveredRows(env.DB);
  env.db.prepare('INSERT INTO imprint_recovery_batches(batch_id,source_sha256,data_sha256,imported_at,order_count,revenue_vnd,period_start,period_end,verification_scope) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('test-recovery','source-hash','data-hash',new Date().toISOString(),3,540000,today,today,'test-only');
  for(const id of ['RECOVERED-01','RECOVERED-02','ACTIVE-01']){
    env.db.prepare('INSERT INTO imprint_recovered_orders(order_id,batch_id,placed_date,placed_at,placed_at_ms,customer_name,customer_email,quantity,value_vnd,product_summary,items_json,source_row) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,'test-recovery',today,placed,when,'Khách lịch sử',customer,1,180000,'Baby Tee',
        JSON.stringify([{sku:'BABY',name:'Baby Tee',color:'Đen',quantity:1,unitPrice:180000,lineTotal:180000}]),1);
  }
  const behavior=(await (await handleBehavior(request('/api/admin/behavior?days=30'),env,admin)).json());
  const direct=await salesAnalytics(env.DB,new URLSearchParams(behavior.historicalOrders.range));
  assert.equal(direct.kpis.orders,3);
  assert.equal(direct.kpis.buyers,2);
  assert.equal(direct.recovery.orders,2);
  assert.equal(behavior.historicalOrders.orders,direct.kpis.orders);
  assert.equal(behavior.historicalOrders.buyers,direct.kpis.buyers);
  assert.equal(behavior.historicalOrders.recoveredOrders,2);
  assert.deepEqual(behavior.historicalOrders.daily,
    direct.daily.map(({day,orders})=>({day,orders})));
  assert.equal(behavior.historicalOrders.range.from,direct.range.from);
  assert.equal(behavior.historicalOrders.range.to,direct.range.to);
  // A period not containing the sales date must exclude archival and live orders.
  const before=new Date(Date.parse(today+'T00:00:00Z')-DAY).toISOString().slice(0,10);
  const out=await salesAnalytics(env.DB,new URLSearchParams({from:before,to:before}));
  assert.equal(out.kpis.orders,0);
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
  assert.equal(report.mergedAnalytics.pageViews,78);
  assert.equal(report.mergedAnalytics.dailyVisitors,23);
  assert.equal(report.mergedAnalytics.importedDays,1);
  assert.equal(report.kpis.sessions,0);
  assert.equal(report.kpis.visitors,0);
  assert.equal(report.kpis.addToCart,0);
  // Same-day Cloudflare counts override first-party counts rather than sum them.
  const guest=sample();
  assert.equal((await worker.fetch(request('/api/behavior','POST',guest),env,{})).status,202);
  const overlap=await(await handleBehavior(request('/api/admin/behavior?days=30'),env,admin)).json();
  assert.equal(overlap.kpis.sessions,1);
  assert.equal(overlap.kpis.visitors,1);
  assert.equal(overlap.mergedAnalytics.pageViews,78);
  assert.equal(overlap.mergedAnalytics.dailyVisitors,23);
  assert.equal(overlap.mergedAnalytics.overlapDays,1);
  assert.equal(overlap.mergedAnalytics.daily.length,1);
  assert.equal(overlap.mergedAnalytics.daily[0].importedPageViews,true);
  assert.equal(overlap.mergedAnalytics.daily[0].importedVisitors,true);
  await assert.rejects(handleBehavior(request('/api/admin/behavior/import-history','POST',
    {source:'cloudflare',rows:[{day:'2020-01-01',visitors:1,pageViews:1}]}),env,admin),{status:400});
  await assert.rejects(handleBehavior(request('/api/admin/behavior/import-history','POST',
    {source:'cloudflare',rows:[{day:date,visitors:-1,pageViews:1}]}),env,admin),{status:400});
  env.db.close();
});


test('recovered sessions restore period uniques and do not double count same-day live activity',async()=>{
  const env=environment(),admin={role:'admin'};
  const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const base={day,pageViews:3,engagementSeconds:546,bounced:0,scrollDepth:66,addToCart:1,converted:0};
  const rows=[
    {...base,sessionId:'IM-S000001',visitorId:'KH-0001'},
    {...base,sessionId:'IM-S000002',visitorId:'KH-0001',pageViews:2},
    {...base,sessionId:'IM-S000003',visitorId:'KH-0002',pageViews:4}
  ];
  // An existing live session for the same calendar day must not inflate
  // restored visitor or session totals.
  assert.equal((await worker.fetch(request('/api/behavior','POST',sample()),env,{})).status,202);
  const source={source:'imprint-workbook',rows};
  assert.equal((await worker.fetch(request('/api/admin/behavior/import-sessions','POST',source),env,{})).status,403);
  let r=await handleBehavior(request('/api/admin/behavior/import-sessions','POST',source),env,admin);
  assert.equal(r.status,200);
  assert.equal((await r.json()).visitors,2);
  await handleBehavior(request('/api/admin/behavior/import-sessions','POST',source),env,admin);
  const report=await(await handleBehavior(request('/api/admin/behavior?days=30'),env,admin)).json();
  assert.equal(report.kpis.sessions,1);
  assert.equal(report.recoveredSessions.sessions,3);
  assert.equal(report.recoveredSessions.visitors,2);
  assert.equal(report.combinedKpis.sessions,3);
  assert.equal(report.combinedKpis.visitors,2);
  assert.equal(report.combinedKpis.addToCart,3);
  assert.equal(report.mergedAnalytics.pageViews,9);
  assert.equal(report.mergedAnalytics.dailyVisitors,2);
  assert.equal(report.mergedSessionsDaily.length,1);
  assert.equal(report.mergedSessionsDaily[0].sessions,3);
  assert.equal(report.combinedKpis.sourceMixed,false);
  assert.equal((await worker.fetch(request('/api/admin/behavior/import-sessions','POST',
    {source:'imprint-workbook',rows:[rows[0],rows[0]]}),env,{})).status,403);
  await assert.rejects(handleBehavior(request('/api/admin/behavior/import-sessions','POST',
    {source:'imprint-workbook',rows:[rows[0],rows[0]]}),env,admin),{status:400});
  env.db.close();
});

test('bulk recovery accepts 849 historical sessions with 511 unique visitors',async()=>{
  const env=environment(),admin={role:'admin'};
  const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  const rows=Array.from({length:849},(_,i)=>({
    day,sessionId:'IM-S'+String(i+1).padStart(6,'0'),
    visitorId:'KH-'+String(i%511+1).padStart(4,'0'),
    pageViews:4,engagementSeconds:546,bounced:0,scrollDepth:66,
    addToCart:0,converted:0
  }));
  const response=await handleBehavior(request('/api/admin/behavior/import-sessions','POST',
    {source:'imprint-workbook',rows}),env,admin);
  assert.equal(response.status,200);
  assert.deepEqual((({imported,visitors})=>({imported,visitors}))(await response.json()),{imported:849,visitors:511});
  const analytics=await(await handleBehavior(request('/api/admin/behavior?days=30'),env,admin)).json();
  assert.equal(analytics.combinedKpis.sessions,849);
  assert.equal(analytics.combinedKpis.visitors,511);
  env.db.close();
});

test('admin behavior client parses as valid JavaScript with an ImPrint-matching palette',()=>{
  const source=fs.readFileSync('src/behavior-client.js','utf8');
  assert.doesNotThrow(()=>new Function(source));
  assert.match(source,/ip-behavior-import/);
  assert.match(source,/isSessionHistoryCSV/);
  assert.match(source,/imprint-workbook/);
  assert.match(source,/Nhập CSV lịch sử/);
  assert.match(source,/data-chart="mergedPageViews"/);
  assert.match(source,/data-chart="mergedDailyVisitors"/);
  assert.match(source,/Đồng bộ Thống kê kinh doanh/);
  assert.match(source,/background:#fffdfa/);
  assert.match(source,/data-value/);
  assert.match(source,/ignoreNextCartPersist/);
});
