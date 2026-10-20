import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/backend.mjs';
import {handleBehavior,recordBehaviorConversion} from '../src/user-behavior.mjs';
import {environment} from './harness.mjs';

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
