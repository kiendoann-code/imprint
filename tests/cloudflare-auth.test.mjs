import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/backend.mjs';
import {environment} from './harness.mjs';
const origin='https://imprint.test';
async function call(env,path,method='GET',value,headers={}){
  const h={...headers};if(method!=='GET'){h.origin=origin;h['content-type']='application/json';}
  return worker.fetch(new Request(origin+path,{method,headers:h,body:value===undefined?undefined:JSON.stringify(value)}),env,{});
}
test('Cloudflare admin password, spoof prevention, logout and secret rotation',async()=>{
  const env={...environment(),ADMIN_AUTH:'password',ADMIN_PASSWORD:'Unique-test-secret-2026'};
  await call(env,'/api/bootstrap');
  const forged={'oai-authenticated-user-email':env.ADMIN_EMAIL};
  assert.equal((await(await call(env,'/api/bootstrap','GET',undefined,forged)).json()).user,null);
  assert.equal((await call(env,'/api/admin/settings/campaign','PUT',{value:'forged',revision:1},forged)).status,403);
  assert.equal((await call(env,'/api/auth/register','POST',{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD,name:'Fake owner'})).status,400);
  assert.equal((await call(env,'/api/auth/login','POST',{email:env.ADMIN_EMAIL,password:'wrong-password'})).status,401);
  let r=await call(env,'/api/auth/login','POST',{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD});
  assert.equal(r.status,200);assert.equal((await r.json()).user.role,'admin');
  const cookie=r.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await call(env,'/api/bootstrap','GET',undefined,{cookie})).json()).user.role,'admin');
  assert.equal((await call(env,'/api/admin/settings/campaign','PUT',{value:'Quản trị riêng',revision:1},{cookie})).status,200);
  const configuredEmail=env.ADMIN_EMAIL;
  delete env.ADMIN_EMAIL;
  assert.equal((await(await call(env,'/api/bootstrap','GET',undefined,{cookie})).json()).user.role,'admin');
  r=await call(env,'/api/auth/login','POST',{email:configuredEmail,password:env.ADMIN_PASSWORD});
  assert.equal(r.status,200);
  env.ADMIN_EMAIL=configuredEmail;
  env.ADMIN_PASSWORD='Another-test-secret-2026';
  assert.equal((await(await call(env,'/api/bootstrap','GET',undefined,{cookie})).json()).user,null);
  r=await call(env,'/api/auth/login','POST',{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD});
  assert.equal(r.status,200);const fresh=r.headers.get('set-cookie').split(';')[0];
  await call(env,'/api/auth/logout','POST',{}, {cookie:fresh});
  assert.equal((await(await call(env,'/api/bootstrap','GET',undefined,{cookie:fresh})).json()).user,null);
  env.db.close();
});
