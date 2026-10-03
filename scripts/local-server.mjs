// Development adapter only. Never expose this server to the internet.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';

const port=3000, origin=`http://localhost:${port}`;
const admin=process.argv.includes('--admin');
const dataDir=path.resolve('.local-data');
fs.mkdirSync(path.join(dataDir,'uploads'),{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'imprint.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY);');
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){
  if(db.prepare('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));db.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);db.exec('COMMIT');}
  catch(e){db.exec('ROLLBACK');throw e;}
}
const DB={prepare(sql){return{bind(...args){return{
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return{results:db.prepare(sql).all(...args)};},
  async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}
};}};},async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
function filePath(key){if(!/^uploads\/[a-f0-9-]+$/.test(key))throw new Error('Invalid local object key');return path.join(dataDir,key);}
const BUCKET={
  async put(key,body){fs.writeFileSync(filePath(key),Buffer.from(await new Response(body).arrayBuffer()));},
  async get(key,options){const f=filePath(key);if(!fs.existsSync(f))return null;const bytes=fs.readFileSync(f);const match=options?.range?.get('range')?.match(/^bytes=(\d+)-(\d*)$/);if(match){const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):bytes.length-1,bytes.length-1);if(start>end)return null;return{body:bytes.subarray(start,end+1),size:bytes.length,range:{offset:start,length:end-start+1}};}return{body:bytes,size:bytes.length};},
  async delete(key){fs.rmSync(filePath(key),{force:true});}
};
const env={DB,BUCKET,ADMIN_EMAIL:'admin@imprint.local'};
let queue=Promise.resolve();
const server=http.createServer(async(req,res)=>{
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host)){res.writeHead(403);res.end('Use localhost:3000');return;}
  try{
    const url=new URL(req.url,origin);
    if(url.pathname==='/signin-with-chatgpt'){
      if(admin){res.writeHead(302,{Location:'/?admin=1'});res.end();}
      else{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<html lang="vi"><meta charset="utf-8"><title>Quản trị localhost</title><p>Dừng server bằng Ctrl+C. Chạy <code>npm run dev:admin</code>, rồi mở <a href="/?admin=1">trang quản trị</a>.</p><p>Đây là chế độ thử trên máy, không đăng nhập ChatGPT.</p></html>');}return;
    }
    const headers=new Headers(req.headers);
    headers.delete('oai-authenticated-user-email');
    headers.set('cf-connecting-ip','127.0.0.1');
    if(admin)headers.set('oai-authenticated-user-email',env.ADMIN_EMAIL);
    if(headers.has('cookie'))headers.set('cookie',headers.get('cookie').replace(/\bimprint_local_session=/g,'__Host-imprint_session='));
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>82*1024*1024){res.writeHead(413);res.end('Tệp quá lớn');return;}chunks.push(chunk);}
    const init={method:req.method,headers};
    if(!['GET','HEAD'].includes(req.method)){const bytes=Buffer.concat(chunks);init.body=bytes;headers.set('content-length',String(bytes.length));}
    const request=new Request(url,init);
    const run=queue.then(()=>worker.fetch(request,env,{}));
    queue=run.then(()=>{},()=>{});
    const response=await run;
    res.statusCode=response.status;
    for(const [key,value]of response.headers){res.setHeader(key,key==='set-cookie'?value.replace('__Host-imprint_session=','imprint_local_session=').replace(/; Secure/g,''):value);}
    if(response.body)for await(const chunk of response.body)res.write(chunk);
    res.end();
  }catch(e){console.error(e);if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end('Không xử lý được yêu cầu localhost.');}
});
server.listen(port,'127.0.0.1',()=>{
  console.log(`\nImPrint: ${origin}${admin?'/?admin=1':''}`);
  console.log(admin?'CHẾ ĐỘ QUẢN TRỊ THỬ: mọi yêu cầu trên server này có quyền quản trị.':'CHẾ ĐỘ KHÁCH HÀNG: đăng ký, thiết kế và đặt hàng thử.');
  console.log('Dữ liệu thử lưu trong .local-data; không kết nối dữ liệu website đang hoạt động.');
  console.log('Dừng server: Ctrl+C.');
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Cổng 3000 đang được sử dụng. Dừng server cũ rồi chạy lại.':e);process.exitCode=1;db.close();});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
