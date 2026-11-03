// Recovered order archive: admin-only, kept separate from live orders and users.
const BATCH_ID = 'IMPRINT-ACTUAL-RECOVERY-20261103-02';
const SOURCE_SHA = '59a72b050d545c84d8e9053044df1d5a6aee51dbf129692e60bf7e2507b8e588';
const DATA_SHA = '575431e11a878107ed03d790e35cb3d8fec65f7ea03af4b89d0e107fcc461c5f';
const fail = (status,message) => { const e=new Error(message); e.status=status; throw e; };
const stmt = (db,sql,...args) => db.prepare(sql).bind(...args);
const get = (db,sql,...args) => stmt(db,sql,...args).first();
const all = async (db,sql,...args) => (await stmt(db,sql,...args).all()).results;
const json = data => new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
const ready=new WeakMap();
async function ensureArchive(db){
  let pending=ready.get(db);
  if(!pending){
    pending=(async()=>{
      await stmt(db,'CREATE TABLE IF NOT EXISTS imprint_recovery_batches (batch_id TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL, data_sha256 TEXT NOT NULL, imported_at TEXT NOT NULL, order_count INTEGER NOT NULL, revenue_vnd INTEGER NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, verification_scope TEXT NOT NULL)').run();
      await stmt(db,'CREATE TABLE IF NOT EXISTS imprint_recovered_orders (order_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES imprint_recovery_batches(batch_id), placed_date TEXT NOT NULL, placed_at TEXT NOT NULL, placed_at_ms INTEGER NOT NULL, customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), value_vnd INTEGER NOT NULL CHECK(value_vnd>=0), product_summary TEXT NOT NULL, items_json TEXT NOT NULL, source_row INTEGER NOT NULL)').run();
      await stmt(db,'CREATE INDEX IF NOT EXISTS imprint_recovered_orders_date ON imprint_recovered_orders(placed_date,placed_at_ms)').run();
      await stmt(db,'CREATE INDEX IF NOT EXISTS imprint_recovered_orders_customer ON imprint_recovered_orders(customer_email)').run();
    })();
    ready.set(db,pending);
    pending.catch(()=>{if(ready.get(db)===pending)ready.delete(db)});
  }
  return pending;
}
function checkedDay(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'') || !Number.isFinite(Date.parse(day+'T00:00:00+07:00')))fail(400,'Ngày lọc không hợp lệ.');
  return day;
}
async function ordersDigest(orders){
  const bytes=new TextEncoder().encode(JSON.stringify(orders));
  const hashed=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hashed)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function validatePayload(data){
  if(!data||data.schema!=='imprint-recovery-v1'||data.batchId!==BATCH_ID||data.sourceSha256!==SOURCE_SHA||data.dataSha256!==DATA_SHA||data.periodStart!=='2026-10-20'||data.periodEnd!=='2026-11-03'||!Array.isArray(data.orders)||data.orders.length!==99)fail(400,'Tệp không khớp hồ sơ khôi phục.');
  const ids=new Set(),customers=new Set(),days=new Set();let sum=0,items=0;
  for(const o of data.orders){
    if(!o||typeof o.id!=='string'||!/^\d{6}-\d{4}$/.test(o.id)||ids.has(o.id))fail(400,'Mã đơn khôi phục trùng hoặc không hợp lệ.');
    ids.add(o.id);
    if(typeof o.placedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(o.placedAt)||!Number.isFinite(Date.parse(o.placedAt)))fail(400,'Ngày giờ đặt không hợp lệ.');
    const date=o.placedAt.slice(0,10);
    if(date<'2026-10-20'||date>'2026-11-03')fail(400,'Ngày đặt ngoài kỳ dữ liệu.');
    days.add(date);
    if(typeof o.customerName!=='string'||!o.customerName.trim()||o.customerName.length>150||typeof o.customerEmail!=='string'||!o.customerEmail.endsWith('@example.com')||o.customerEmail.length>254)fail(400,'Thông tin người mua nguồn không hợp lệ.');
    customers.add(o.customerEmail);
    if(!Number.isSafeInteger(o.value)||o.value<0||!Number.isSafeInteger(o.quantity)||o.quantity<1||!Number.isInteger(o.sourceRow)||o.sourceRow<1||typeof o.productSummary!=='string'||o.productSummary.length>500||!Array.isArray(o.items)||!o.items.length||o.items.length>20)fail(400,'Đơn hàng khôi phục thiếu trường.');
    let itemValue=0,itemQty=0;
    for(const item of o.items){
      if(!item||typeof item.sku!=='string'||typeof item.name!=='string'||typeof item.color!=='string'||!Number.isSafeInteger(item.quantity)||item.quantity<1||!Number.isSafeInteger(item.unitPrice)||item.unitPrice<0||item.lineTotal!==item.quantity*item.unitPrice)fail(400,'Sản phẩm trong đơn không hợp lệ.');
      itemValue+=item.lineTotal;itemQty+=item.quantity;items++;
    }
    if(itemValue!==o.value||itemQty!==o.quantity)fail(400,'Số lượng hoặc tổng tiền không khớp dòng sản phẩm.');
    sum+=o.value;
  }
  if(sum!==20020000||customers.size!==72||days.size!==15||items!==100)fail(400,'Chênh lệch số liệu so với bản đối soát.');
}
async function importArchive(db,data){
  validatePayload(data);
  if(await ordersDigest(data.orders)!==DATA_SHA)fail(400,'Nội dung dữ liệu không trùng khớp bản khôi phục gốc.');
  const existing=await get(db,'SELECT * FROM imprint_recovery_batches WHERE batch_id=?',BATCH_ID);
  if(existing){
    if(existing.data_sha256!==DATA_SHA||existing.order_count!==99||existing.revenue_vnd!==20020000)fail(409,'Lô dữ liệu đã có nhưng không khớp nguồn.');
    return {ok:true,alreadyImported:true,orders:99,customers:72,revenueVnd:20020000};
  }
  // Never overwrite or reinterpret live orders.
  for(let offset=0;offset<data.orders.length;offset+=30){
    const ids=data.orders.slice(offset,offset+30).map(o=>o.id);
    const collision=await all(db,'SELECT id FROM orders WHERE id IN ('+ids.map(()=>'?').join(',')+') LIMIT 1',...ids);
    if(collision.length)fail(409,'Trùng mã đơn đang hoạt động: '+collision[0].id);
  }
  const batch=[stmt(db,'INSERT INTO imprint_recovery_batches (batch_id,source_sha256,data_sha256,imported_at,order_count,revenue_vnd,period_start,period_end,verification_scope) VALUES(?,?,?,?,?,?,?,?,?)',
    BATCH_ID,SOURCE_SHA,DATA_SHA,new Date().toISOString(),99,20020000,'2026-10-20','2026-11-03','User-attested source; internally reconciled; not independently verified')];
  for(const o of data.orders)batch.push(stmt(db,'INSERT INTO imprint_recovered_orders (order_id,batch_id,placed_date,placed_at,placed_at_ms,customer_name,customer_email,quantity,value_vnd,product_summary,items_json,source_row) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    o.id,BATCH_ID,o.placedAt.slice(0,10),o.placedAt,Date.parse(o.placedAt),o.customerName,o.customerEmail,o.quantity,o.value,o.productSummary,JSON.stringify(o.items),o.sourceRow));
  await db.batch(batch); // Transactional in Cloudflare D1.
  return {ok:true,alreadyImported:false,orders:99,customers:72,revenueVnd:20020000};
}
async function listArchive(db,params){
  const from=checkedDay(params.get('from')||'2026-10-20'),to=checkedDay(params.get('to')||'2026-11-03');
  if(from>to)fail(400,'Khoảng ngày không hợp lệ.');
  const page=Number(params.get('page')||1),q=(params.get('q')||'').trim().slice(0,100);
  if(!Number.isInteger(page)||page<1||page>10000)fail(400,'Trang không hợp lệ.');
  let where='r.placed_date>=? AND r.placed_date<=?',args=[from,to];
  if(q){where+=' AND (instr(lower(r.order_id),lower(?))>0 OR instr(lower(r.customer_name),lower(?))>0 OR instr(lower(r.customer_email),lower(?))>0)';args.push(q,q,q)}
  const scope=' FROM imprint_recovered_orders r JOIN imprint_recovery_batches b ON b.batch_id=r.batch_id WHERE '+where;
  const summary=await get(db,'SELECT COUNT(*) orders,COALESCE(SUM(r.value_vnd),0) revenueVnd,COUNT(DISTINCT r.customer_email) customers,COALESCE(SUM(r.quantity),0) units'+scope,...args);
  const daily=await all(db,'SELECT r.placed_date day,COUNT(*) orders,SUM(r.value_vnd) revenueVnd'+scope+' GROUP BY r.placed_date ORDER BY r.placed_date',...args);
  const customers=await all(db,'SELECT r.customer_name name,r.customer_email email,COUNT(*) orders,SUM(r.value_vnd) revenueVnd,MIN(r.placed_at) firstOrder,MAX(r.placed_at) lastOrder'+scope+' GROUP BY r.customer_email ORDER BY lastOrder DESC LIMIT 30',...args);
  const found=await all(db,'SELECT r.order_id id,r.placed_at placedAt,r.customer_name customerName,r.customer_email customerEmail,r.quantity,r.value_vnd valueVnd,r.product_summary productSummary,r.items_json itemsJson,r.source_row sourceRow'+scope+' ORDER BY r.placed_at_ms DESC,r.order_id DESC LIMIT 20 OFFSET ?',...args,(page-1)*20);
  const total=Number(summary.orders);
  return {source:'recovered_archive',readOnly:true,verification:'user_attested_internal_consistency_only',emailVerification:'not_verified_nonroutable',range:{from,to},summary,daily,customers,orders:found.map(o=>({...o,items:JSON.parse(o.itemsJson),itemsJson:undefined})),total,page,pages:Math.max(1,Math.ceil(total/20))};
}
export async function handleRecoveredOrders(req,env,user){
  const path=new URL(req.url).pathname;
  if(path!=='/api/admin/recovered-orders'&&path!=='/api/admin/recovered-orders/import')return null;
  if(user?.role!=='admin')fail(403,'Bạn không có quyền quản trị.');
  await ensureArchive(env.DB);
  if(path==='/api/admin/recovered-orders'&&req.method==='GET')return json(await listArchive(env.DB,new URL(req.url).searchParams));
  if(path==='/api/admin/recovered-orders/import'&&req.method==='POST'){
    if(user.id!=='site-owner')fail(403,'Chỉ quản trị chính được nhập đơn lịch sử.');
    const raw=await req.text();
    if(new TextEncoder().encode(raw).length>250000)fail(413,'Tệp khôi phục quá lớn.');
    let payload;try{payload=JSON.parse(raw)}catch{fail(400,'Tệp JSON không hợp lệ.')}
    return json(await importArchive(env.DB,payload));
  }
  fail(405,'Phương thức không được hỗ trợ.');
}
