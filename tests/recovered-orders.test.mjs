import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRecoveredOrders} from '../src/recovered-orders.mjs';
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
