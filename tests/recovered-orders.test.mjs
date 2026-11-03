import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRecoveredOrders,readRecoveredRows} from '../src/recovered-orders.mjs';
import {salesAnalytics} from '../src/admin-sales.mjs';
import {getMergedBootstrapOrders,getMergedOrderPage} from '../src/merged-recovery.mjs';
import {environment} from './harness.mjs';
const url='https://imprint.test/api/admin/recovered-orders';
const owner={id:'site-owner',role:'admin'};
test('archive is admin-only, initially empty and separate from operational orders',async()=>{
  const env=environment();
  await assert.rejects(()=>handleRecoveredOrders(new Request(url),env,null),{status:403});
  const result=await handleRecoveredOrders(new Request(url),env,owner);
  const data=await result.json();
  assert.equal(data.source,'recovered_archive');
  assert.equal(data.summary.orders,0);
  assert.equal(env.db.prepare('SELECT count(*) n FROM orders').get().n,0);
  env.db.close();
});
test('only site owner can import a valid recovery file',async()=>{
  const env=environment();
  const req=()=>new Request(url+'/import',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await assert.rejects(()=>handleRecoveredOrders(req(),env,{id:'other-admin',role:'admin'}),{status:403});
  await assert.rejects(()=>handleRecoveredOrders(req(),env,owner),{status:400});
  assert.equal(env.db.prepare('SELECT count(*) n FROM imprint_recovered_orders').get().n,0);
  env.db.close();
});

test('recovered delivered orders appear in the SAME KPIs, charts and order lists exactly once',async()=>{
  const env=environment();
  const liveAt='2026-10-20T08:10:00+07:00';
  const liveBody={id:'IP-EXISTING',owner:'live@example.test',date:liveAt,
    status:5,shipping:{fullName:'Khách gốc',phone:'0912345678',address:'Hà Nội'},
    items:[{product:{id:'tee',name:'Boxy Tee'},qty:1,unit:205000}],
    sub:205000,discount:0,total:205000,history:[]};
  env.db.prepare('INSERT INTO users(id,email,name,salt,password_hash,profile,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('live-user','live@example.test','Khách gốc','salt','hash','{}',Date.parse(liveAt));
  env.db.prepare('INSERT INTO orders(id,user_id,request_key,body,status,created_at) VALUES(?,?,?,?,?,?)')
    .run(liveBody.id,'live-user','existing-order',JSON.stringify(liveBody),5,Date.parse(liveAt));
  await readRecoveredRows(env.DB);
  env.db.prepare('INSERT INTO imprint_recovery_batches(batch_id,source_sha256,data_sha256,imported_at,order_count,revenue_vnd,period_start,period_end,verification_scope) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('test-batch','original','data','2026-11-03T00:00:00Z',1,180000,'2026-10-20','2026-11-03','internal');
  const historicAt='2026-10-20T09:15:00+07:00';
  env.db.prepare('INSERT INTO imprint_recovered_orders(order_id,batch_id,placed_date,placed_at,placed_at_ms,customer_name,customer_email,quantity,value_vnd,product_summary,items_json,source_row) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('REC-0001','test-batch','2026-10-20',historicAt,Date.parse(historicAt),'Khách lịch sử','source@example.com',1,180000,'Baby Tee',JSON.stringify([{sku:'IM-BABY',name:'Baby Tee',color:'Đen',quantity:1,unitPrice:180000,lineTotal:180000}]),1);
  const params=new URLSearchParams({from:'2026-10-20',to:'2026-10-20'});
  const stats=await salesAnalytics(env.DB,params);
  assert.equal(stats.kpis.orders,2);
  assert.equal(stats.kpis.delivered,2);
  assert.equal(stats.kpis.deliveredRevenue,385000);
  assert.equal(stats.kpis.buyers,2);
  assert.equal(stats.daily.length,1);
  assert.equal(stats.daily[0].orders,2);
  assert.equal(stats.daily[0].revenue,385000);
  assert.equal(stats.recovery.orders,1);
  const range={start:Date.parse('2026-10-20T00:00:00+07:00'),end:Date.parse('2026-10-21T00:00:00+07:00')};
  const orders=await getMergedOrderPage(env.DB,range,new URLSearchParams());
  assert.equal(orders.total,2);
  assert.equal(orders.orders[0].id,'REC-0001');
  assert.equal(orders.orders[0].readOnly,true);
  assert.equal((await getMergedBootstrapOrders(env.DB)).length,2);
  const second=await salesAnalytics(env.DB,params);
  assert.equal(second.kpis.deliveredRevenue,385000,'Repeat report must not duplicate recovered revenue');
  // A later live order with the same ID must supersede the archived copy.
  const duplicate={...liveBody,id:'REC-0001'};
  env.db.prepare('INSERT INTO orders(id,user_id,request_key,body,status,created_at) VALUES(?,?,?,?,?,?)')
    .run(duplicate.id,'live-user','collision',JSON.stringify(duplicate),5,Date.parse(historicAt));
  const deduped=await salesAnalytics(env.DB,params);
  assert.equal(deduped.kpis.orders,2);
  assert.equal(deduped.kpis.deliveredRevenue,410000);
  assert.equal(deduped.recovery.orders,0);
  env.db.close();
});

test('admin hides the obsolete recovery panel while retaining merged statistics and orders',async()=>{
  const fs=await import('node:fs');
  const client=fs.readFileSync('src/client-api.js','utf8');
  const analytics=fs.readFileSync('src/admin-sales.mjs','utf8');
  const backend=fs.readFileSync('src/backend.mjs','utf8');
  assert.equal(client.includes('renderRecoveredOrdersPanel()'),false);
  assert.equal(client.includes('imprint-recovered-orders'),false);
  assert.equal(client.includes('Khôi phục và gộp vào thống kê đơn hàng ImPrint'),false);
  assert.match(analytics,/mergeRecoveredAnalytics/);
  assert.match(analytics,/getMergedOrderPage/);
  assert.match(backend,/getMergedBootstrapOrders/);
});
