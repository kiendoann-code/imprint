import {build} from 'esbuild';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {applyDesignAreaPatch} from './apply-design-area-patch.mjs';

const output='dist-cloudflare';
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output+'/public/static',{recursive:true});
fs.mkdirSync(output+'/worker',{recursive:true});
const assets=new Set();
function extract(data){
  const m=data.match(/^data:([^;]+);base64,([\w+/=]+)$/);
  if(!m)return data;
  const ext={'image/png':'png','image/webp':'webp','image/jpeg':'jpg','font/woff2':'woff2','font/woff':'woff','video/mp4':'mp4'}[m[1]]||'bin';
  const url='/static/'+crypto.createHash('sha256').update(data).digest('hex')+'.'+ext;
  fs.writeFileSync(output+'/public'+url,Buffer.from(m[2],'base64'));
  assets.add(url);return url;
}
let html=applyDesignAreaPatch(fs.readFileSync('src/index.html','utf8')).replace(/data:[\w/+.-]+;base64,[\w+/=]+/g,extract);
const seed=JSON.parse(fs.readFileSync('src/seed.json','utf8'));
for(const p of seed.products)p.img=extract(p.img);
for(const c of seed.collections)c.src=extract(c.src);
html=html.replace('init().catch(e=>',fs.readFileSync('src/client-api.js','utf8')+'\ninit().catch(e=>');
html=html.replace(/Không mở được bộ nhớ trình duyệt\./g,'Không kết nối được ImPrint.').replace('Hãy mở file bằng Chrome hoặc Edge, cho phép lưu dữ liệu và không dùng chế độ chặn lưu trữ.','Kiểm tra kết nối mạng và tải lại trang.');
fs.writeFileSync(output+'/public/index.html',html);
fs.writeFileSync(output+'/public/_headers','/static/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n/\n  Cache-Control: no-cache\n  Referrer-Policy: strict-origin-when-cross-origin\n');
fs.writeFileSync(output+'/worker/generated.mjs','export const html="";export const builtAssets={};export const seedCatalog='+JSON.stringify(seed)+';');
fs.copyFileSync('src/backend.mjs',output+'/worker/backend.mjs');
fs.writeFileSync(output+'/worker/entry.mjs',`import backend from './backend.mjs';
export default {fetch(req,env,ctx){if(new URL(req.url).pathname.startsWith('/api/'))return backend.fetch(req,{...env,ADMIN_AUTH:'password'},ctx);return env.ASSETS.fetch(req)}};`);
await build({entryPoints:[output+'/worker/entry.mjs'],outfile:output+'/worker/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
for(const name of ['entry.mjs','generated.mjs','backend.mjs'])fs.rmSync(path.join(output,'worker',name));
console.log(JSON.stringify({assets:assets.size,products:seed.products.length,workerBytes:fs.statSync(output+'/worker/index.js').size}));
