// ImPrint Design Library API v1 — independent of product/editor data.
import {BUILTIN_VECTORS} from './design-library-vectors.mjs';
// Library deletes are soft; uploaded R2 objects must stay for saved designs and orders.
const CATEGORIES=new Set(['Art','Icon','Vector']);
const ROOT='/api/design-library',ADMIN='/api/admin/design-library';
const j=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function bad(code,message){const e=new Error(message);e.status=code;throw e}
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const many=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const clean=(v,max=90)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
async function readJSON(req){const raw=await req.text();if(raw.length>16000)bad(413,'Dữ liệu quá lớn.');try{return JSON.parse(raw)}catch{bad(400,'Dữ liệu chưa hợp lệ.')}}
async function prepare(db){await run(db,`CREATE TABLE IF NOT EXISTS design_library_items (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 media_id TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0,
 enabled INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
)`)}
function validId(id){if(!/^[a-f0-9-]{36}$/.test(id||''))bad(400,'Mã tài nguyên chưa hợp lệ.');return id}
async function media(db,id,category){validId(id);const row=await one(db,'SELECT id,type,public FROM assets WHERE id=?',id);if(!row||!row.public||!['image/png','image/jpeg','image/webp','image/avif','image/svg+xml'].includes(row.type))bad(400,'Ảnh chưa được tải lên công khai hoặc không đúng định dạng.');if((row.type==='image/svg+xml')!==(category==='Vector'))bad(400,'Nhóm Vector chỉ nhận SVG; SVG không được đặt ở Art hoặc Icon.');return row}
function shape(row){return {id:row.id,name:row.name,category:row.category,mediaId:row.media_id,url:'/api/files/'+row.media_id,alt:row.alt,position:row.position,enabled:!!row.enabled,archived:!!row.archived,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}}
function approvedSVG(input){const svg=input.trim();if(svg.length>2*1024*1024||!/^<svg(?:\s|>)/i.test(svg)||!/<\/svg\s*>$/i.test(svg))return false;
 if(/<\?|<!|&|\b(?:href|src|style|on[a-z]+)\s*=|\b(?:javascript|data|vbscript)\s*:|url\s*\(|(?:xmlns\s*:\s*\w+)/i.test(svg))return false;
 const allowed=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','lineargradient','radialgradient','stop','clippath','title','desc']);
 for(const m of svg.matchAll(/<\s*\/?\s*([\w:-]+)/g))if(!allowed.has(m[1].toLowerCase()))return false;
 if(/<(?!\/?(?:svg|g|path|rect|circle|ellipse|line|polyline|polygon|defs|lineargradient|radialgradient|stop|clippath|title|desc)\b)/i.test(svg))return false;
 // No CSS, XML entities, external references, untrusted renderable foreign content.
 return true;
}
// One-time idempotent seed: assets are stored in the existing public R2 bucket + D1 table.
// Stable identifiers keep saved designs valid. Archiving via Admin never triggers reseeding.
async function ensureBuiltinVectors(env){
 const db=env.DB,key='imprint-vector-art-pack-10-20261020-v1';
 await run(db,'CREATE TABLE IF NOT EXISTS design_library_packs (key TEXT PRIMARY KEY, created_at INTEGER NOT NULL)');
 if(await one(db,'SELECT key FROM design_library_packs WHERE key=?',key))return;
 const timestamp=Date.now(),encoder=new TextEncoder();
 for(const art of BUILTIN_VECTORS){
  validId(art.id);validId(art.assetId);
  if(!approvedSVG(art.svg))throw Error('Bundled vector failed SVG security checks: '+art.filename);
  const bytes=encoder.encode(art.svg),objectKey='uploads/'+art.assetId;
  // A retry can safely write the same immutable original bytes again.
  await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:'image/svg+xml'}});
  await run(db,'INSERT OR IGNORE INTO assets(id,owner,object_key,type,size,public,metadata,created_at) VALUES(?,?,?,?,?,?,?,?)',art.assetId,'site-owner',objectKey,'image/svg+xml',bytes.byteLength,1,JSON.stringify({name:art.filename,width:512,height:512,source:'imprint-authored-svg-pack-v1'}),timestamp);
  await run(db,'INSERT OR IGNORE INTO design_library_items(id,name,category,media_id,alt,position,enabled,archived,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',art.id,art.name,'Vector',art.assetId,art.alt,art.position,1,0,1,timestamp,timestamp);
 }
 await run(db,'INSERT OR IGNORE INTO design_library_packs(key,created_at) VALUES(?,?)',key,timestamp);
}
export async function handleDesignLibrary(req,env,u){
 const url=new URL(req.url),path=url.pathname;
 if(path!==ROOT&&path!==ADMIN&&!path.startsWith(ADMIN+'/'))return null;
 const isAdmin=path===ADMIN||path.startsWith(ADMIN+'/');
 if(isAdmin&&u?.role!=='admin')bad(403,'Chỉ quản trị viên được chỉnh sửa thư viện.');
 await prepare(env.DB);const db=env.DB;
 if(req.method==='GET'&&(path===ROOT||path===ADMIN)){
  if(env.BUILTIN_VECTOR_PACK){try{await ensureBuiltinVectors(env)}catch(e){console.error('ImPrint vector pack seed',e)}}
  const rows=await many(db,`SELECT * FROM design_library_items ${isAdmin?'':'WHERE archived=0 AND enabled=1'} ORDER BY position ASC,created_at DESC`);
  return j({items:rows.map(shape)});
 }
 if(path===ADMIN+'/upload'&&req.method==='POST'){
  // SVG bypasses the regular uploader only after a strict safety check; never overwritten/deleted in R2.
  const ct=req.headers.get('content-type')?.split(';')[0]?.toLowerCase();if(ct!=='image/svg+xml')bad(415,'Chỉ nhận tệp SVG.');
  const size=Number(req.headers.get('content-length'));
  if(!size||size>2*1024*1024)bad(413,'SVG cần nhỏ hơn 2 MB.');
  const bytes=await req.arrayBuffer();if(bytes.byteLength!==size)bad(400,'Dung lượng tệp chưa khớp.');
  const svg=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!approvedSVG(svg))bad(400,'SVG có thành phần không an toàn hoặc không được hỗ trợ. Hãy dùng SVG thuần path/shape, không chứa script, style, liên kết hay nội dung nhúng.');
  const id=crypto.randomUUID(),key='uploads/'+id;
  await env.BUCKET.put(key,new TextEncoder().encode(svg),{httpMetadata:{contentType:'image/svg+xml'}});
  try{await run(db,'INSERT INTO assets(id,owner,object_key,type,size,public,metadata,created_at) VALUES(?,?,?,?,?,?,?,?)',id,u.id,key,'image/svg+xml',size,1,JSON.stringify({name:'Vector SVG'}),Date.now())}
  catch(e){await env.BUCKET.delete(key);throw e}
  return j({id,url:'/api/files/'+id},201);
 }
 if(req.method==='POST'&&path===ADMIN){
  const v=await readJSON(req),name=clean(v.name),category=v.category;
  if(!name||!CATEGORIES.has(category))bad(400,'Nhập tên và loại Art, Icon hoặc Vector.');
  await media(db,v.mediaId,category);
  const id=crypto.randomUUID(),now=Date.now(),alt=clean(v.alt,180),position=Number.isInteger(v.position)?Math.max(0,Math.min(v.position,100000)):0;
  await run(db,'INSERT INTO design_library_items(id,name,category,media_id,alt,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,name,category,v.mediaId,alt,position,now,now);
  return j({item:shape(await one(db,'SELECT * FROM design_library_items WHERE id=?',id))},201);
 }
 const match=path.match(/^\/api\/admin\/design-library\/([a-f0-9-]{36})$/);
 if(match){const id=validId(match[1]),old=await one(db,'SELECT * FROM design_library_items WHERE id=?',id);if(!old)bad(404,'Không tìm thấy tài nguyên.');
  if(req.method==='PATCH'){
   const v=await readJSON(req),rev=v.revision;
   if(!Number.isSafeInteger(rev)||rev<1)bad(400,'Phiên bản chỉnh sửa không hợp lệ.');
   const category=v.category===undefined?old.category:v.category,name=v.name===undefined?old.name:clean(v.name),mediaId=v.mediaId===undefined?old.media_id:v.mediaId;
   if(!CATEGORIES.has(category)||!name)bad(400,'Tên hoặc phân loại không hợp lệ.');
   await media(db,mediaId,category);
   const alt=v.alt===undefined?old.alt:clean(v.alt,180),position=v.position===undefined?old.position:v.position;
   if(!Number.isInteger(position)||position<0||position>100000)bad(400,'Thứ tự không hợp lệ.');
   const enabled=v.enabled===undefined?old.enabled:Number(v.enabled===true),archived=v.archived===undefined?old.archived:Number(v.archived===true);
   const update=await run(db,'UPDATE design_library_items SET name=?,category=?,media_id=?,alt=?,position=?,enabled=?,archived=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',name,category,mediaId,alt,position,enabled,archived,Date.now(),id,rev);
   if(update.meta.changes!==1)bad(409,'Tài nguyên đã được sửa ở nơi khác. Tải lại trước khi lưu.');
   return j({item:shape(await one(db,'SELECT * FROM design_library_items WHERE id=?',id))});
  }
  if(req.method==='DELETE'){
   const v=await readJSON(req);if(!Number.isSafeInteger(v.revision))bad(400,'Thiếu phiên bản xóa.');
   const result=await run(db,'UPDATE design_library_items SET archived=1,enabled=0,revision=revision+1,updated_at=? WHERE id=? AND revision=?',Date.now(),id,v.revision);
   if(result.meta.changes!==1)bad(409,'Tài nguyên đã thay đổi. Hãy tải lại.');
   return j({ok:true});
  }
 }
 bad(405,'Thao tác không được hỗ trợ.');
}