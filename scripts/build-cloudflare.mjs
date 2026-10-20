import {prepareAdminBuild} from './build-admin-assets.mjs';
import {optimizePage} from './optimize-page.mjs';
import {optimizeStaticImages} from './optimize-images.mjs';
import {build,transform} from 'esbuild';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

// Cloudflare Workers Builds is linked to the production Worker named "imprint".
// Keep the repository's existing deployment settings/bindings intact, but align
// the Worker name in the ephemeral CI checkout before Wrangler deploys it.
const wranglerPath='wrangler.jsonc';
if(fs.existsSync(wranglerPath)){
  const wrangler=fs.readFileSync(wranglerPath,'utf8');
  const aligned=wrangler.replace(/"name"\s*:\s*"imprint-store"/,'"name": "imprint"');
  if(aligned!==wrangler)fs.writeFileSync(wranglerPath,aligned);
}

const output='dist-cloudflare';
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output+'/public/static',{recursive:true});
fs.mkdirSync(output+'/worker',{recursive:true});
if(fs.existsSync('src/size-guides')){
  fs.cpSync('src/size-guides',output+'/public/static/size-guides',{recursive:true});
}
const assets=new Set();
function extract(data){
  const m=data.match(/^data:([^;]+);base64,([\w+/=]+)$/);
  if(!m)return data;
  const ext={'image/png':'png','image/webp':'webp','image/jpeg':'jpg','font/woff2':'woff2','font/woff':'woff','video/mp4':'mp4'}[m[1]]||'bin';
  const url='/static/'+crypto.createHash('sha256').update(data).digest('hex')+'.'+ext;
  fs.writeFileSync(output+'/public'+url,Buffer.from(m[2],'base64'));
  assets.add(url);return url;
}
let html=fs.readFileSync('src/index.html','utf8').replace(/data:[\w/+.-]+;base64,[\w+/=]+/g,extract);
let seed=JSON.parse(fs.readFileSync('src/seed.json','utf8'));
for(const p of seed.products)p.img=extract(p.img);
for(const c of seed.collections)c.src=extract(c.src);
html=html.replace('init().catch(e=>',fs.readFileSync('src/client-api.js','utf8')+'\n'+fs.readFileSync('src/admin-color-picker.js','utf8')+'\n'+fs.readFileSync('src/seo-client.js','utf8')+'\n'+fs.readFileSync('src/size-guide.js','utf8')+'\n'+fs.readFileSync('src/design-library-client.js','utf8')+'\n'+fs.readFileSync('src/studio-font-pack.js','utf8')+'\n'+fs.readFileSync('src/behavior-client.js','utf8')+'\ninit().catch(e=>');
html=html.replace(/Không mở được bộ nhớ trình duyệt\./g,'Không kết nối được ImPrint.').replace('Hãy mở file bằng Chrome hoặc Edge, cho phép lưu dữ liệu và không dùng chế độ chặn lưu trữ.','Kiểm tra kết nối mạng và tải lại trang.');
const imageOptimization=await optimizeStaticImages({directory:output,assets,html,seed});
html=imageOptimization.html;
seed=imageOptimization.seed;
const optimized=optimizePage(html,{externalizeScript:true});
html=optimized.html;
// Reduce transfer and JS parse overhead without renaming globals used by inline
// event handlers or changing the authored DOM, styling, product imagery or routes.
const compactApp=await transform(optimized.script.source,{
  loader:'js',target:'es2022',minifyWhitespace:true,minifySyntax:true,
  minifyIdentifiers:false,legalComments:'none'
});
const compactHash=crypto.createHash('sha256').update(compactApp.code).digest('hex').slice(0,24);
const compactPath='/static/imprint-app-'+compactHash+'.js';
html=html.replace(optimized.script.path,compactPath);
fs.writeFileSync(output+'/public'+compactPath,compactApp.code);
fs.writeFileSync(output+'/public/index.html',html);
fs.writeFileSync(output+'/public/static/imprint-performance-20261021-v3.json',JSON.stringify({
  release:'imprint-performance-20261021-v3',optimized:true,
  imageOptimization:{files:imageOptimization.stats.length,bytesSaved:imageOptimization.bytesSaved},
  features:['lazy-design-studio-mockups','lazy-studio-fonts','preload-original-hero','cacheable-deferred-app-js','syntax-and-whitespace-minified-js','content-addressed-webp-image-optimization','viewport-gated-homepage-video']
}));
fs.writeFileSync(output+'/public/_headers','/static/*\n  Cache-Control: public, max-age=86400\n  X-Content-Type-Options: nosniff\n/\n  Cache-Control: no-cache\n  Referrer-Policy: strict-origin-when-cross-origin\n');
fs.writeFileSync(output+'/worker/generated.mjs','export const html="";export const builtAssets={};export const seedCatalog='+JSON.stringify(seed)+';');
fs.copyFileSync('src/backend.mjs',output+'/worker/backend.mjs');
fs.writeFileSync(output+'/worker/entry.mjs',`import backend from './backend.mjs';
export default {async fetch(req,env,ctx){
 const pathname=new URL(req.url).pathname;
 if(pathname.startsWith('/static/')){
  const response=await env.ASSETS.fetch(req);
  if(!response.ok)return response;
  if(/^\\/static\\/(?:[a-f0-9]{64}\\.(?:png|jpg|jpeg|webp|woff2?|mp4)|imprint-app-[a-f0-9]{24}\\.js)$/.test(pathname)){
   const headers=new Headers(response.headers);
   headers.set('Cache-Control','public, max-age=31536000, immutable');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
  return response;
 }
 return backend.fetch(req,{...env,ADMIN_AUTH:'password'},ctx);
}};`);
prepareAdminBuild('cloudflare');fs.copyFileSync('src/gallery-reviews.mjs','dist-cloudflare/worker/gallery-reviews.mjs');fs.copyFileSync('src/seo.mjs','dist-cloudflare/worker/seo.mjs');await build({entryPoints:[output+'/worker/entry.mjs'],outfile:output+'/worker/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'});
for(const name of ['entry.mjs','generated.mjs','backend.mjs'])fs.rmSync(path.join(output,'worker',name));
const heaviest=[...assets].map(url=>{
  const file=path.join(output,'public',url.slice(1));
  return {url,bytes:fs.existsSync(file)?fs.statSync(file).size:0};
}).sort((a,b)=>b.bytes-a.bytes).slice(0,12);
console.log(JSON.stringify({assets:assets.size,products:seed.products.length,workerBytes:fs.statSync(output+'/worker/index.js').size,optimizedImages:imageOptimization.stats.length,imageBytesSaved:imageOptimization.bytesSaved,largestStaticAssets:heaviest}));
