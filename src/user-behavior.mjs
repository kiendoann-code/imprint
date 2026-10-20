// Anonymous first-party session analytics. Never save URL query strings, IP, email, phone, or messages.
const DAY=86400000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const initialized=new WeakSet();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function bad(status,message){const e=new Error(message);e.status=status;throw e}
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
async function ensureTables(db){
  if(initialized.has(db))return;
  await db.prepare("CREATE TABLE IF NOT EXISTS behavior_sessions (session_id TEXT PRIMARY KEY NOT NULL, visitor_id TEXT NOT NULL, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, engaged_ms INTEGER NOT NULL DEFAULT 0, page_views INTEGER NOT NULL DEFAULT 0, max_scroll INTEGER NOT NULL DEFAULT 0, interactions INTEGER NOT NULL DEFAULT 0, converted INTEGER NOT NULL DEFAULT 0)").bind().run();
  await db.prepare('CREATE INDEX IF NOT EXISTS behavior_sessions_started ON behavior_sessions(started_at)').bind().run();
  await db.prepare("CREATE TABLE IF NOT EXISTS behavior_cart_events (event_id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, visitor_id TEXT NOT NULL, created_at INTEGER NOT NULL)").bind().run();
  await db.prepare('CREATE INDEX IF NOT EXISTS behavior_cart_events_created ON behavior_cart_events(created_at)').bind().run();
  await db.prepare("CREATE TABLE IF NOT EXISTS behavior_external_daily (day TEXT PRIMARY KEY NOT NULL, visitors INTEGER, page_views INTEGER, source TEXT NOT NULL)").bind().run();
  initialized.add(db);
}
async function recordEvent(db,p){
  if(!p||typeof p!=='object'||Array.isArray(p)||!UUID.test(p.sessionId)||!UUID.test(p.visitorId)||
    !integer(p.pageViews,0,1)||!integer(p.engagedMs,0,60000)||
    !integer(p.scrollDepth,0,100)||!integer(p.interactions,0,100)){
    bad(400,'Dữ liệu đo lường chưa hợp lệ.');
  }
  const now=Date.now();
  await db.prepare(
    'INSERT INTO behavior_sessions(session_id,visitor_id,started_at,updated_at,engaged_ms,page_views,max_scroll,interactions) VALUES(?,?,?,?,?,?,?,?) '+
    'ON CONFLICT(session_id) DO UPDATE SET '+
    'updated_at=excluded.updated_at, engaged_ms=MIN(behavior_sessions.engaged_ms+excluded.engaged_ms,86400000), '+
    'page_views=MIN(behavior_sessions.page_views+excluded.page_views,10000), '+
    'max_scroll=MAX(behavior_sessions.max_scroll,excluded.max_scroll), '+
    'interactions=MIN(behavior_sessions.interactions+excluded.interactions,100000) '+
    'WHERE behavior_sessions.visitor_id=excluded.visitor_id AND excluded.updated_at-behavior_sessions.updated_at<=1800000'
  ).bind(p.sessionId,p.visitorId,now,now,p.engagedMs,p.pageViews,p.scrollDepth,p.interactions).run();
  // Bounded retention: preserve enough history for the 90-day view, not indefinitely.
  if(Math.random()<0.005){
    await db.prepare('DELETE FROM behavior_sessions WHERE started_at<?').bind(now-120*DAY).run();
    await db.prepare('DELETE FROM behavior_cart_events WHERE created_at<?').bind(now-120*DAY).run();
  }
}
async function recordCartAdd(db,p){
  if(!p||!UUID.test(p.eventId||'')||!UUID.test(p.sessionId||'')||!UUID.test(p.visitorId||''))bad(400,'Sự kiện thêm giỏ chưa hợp lệ.');
  const now=Date.now();
  await db.prepare('INSERT OR IGNORE INTO behavior_cart_events(event_id,session_id,visitor_id,created_at) VALUES(?,?,?,?)')
    .bind(p.eventId,p.sessionId,p.visitorId,now).run();
}
async function importHistory(db,body){
  if(!body||body.source!=='cloudflare'||!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>100)bad(400,'Tệp thống kê không hợp lệ.');
  const now=Date.now(),today=new Date(now+7*3600000).toISOString().slice(0,10);
  const seen=new Set(),statements=[];
  for(const r of body.rows){
    if(!r||typeof r.day!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.day)||
      !Number.isFinite(Date.parse(r.day+'T00:00:00Z'))||new Date(r.day+'T00:00:00Z').toISOString().slice(0,10)!==r.day||
      r.day>today||Date.parse(r.day+'T00:00:00Z')<now-91*DAY||
      seen.has(r.day))bad(400,'Ngày thống kê chưa hợp lệ hoặc trùng lặp.');
    const visitors=r.visitors===null||r.visitors===undefined?null:r.visitors;
    const views=r.pageViews===null||r.pageViews===undefined?null:r.pageViews;
    if((visitors===null&&views===null)||
       (visitors!==null&&!integer(visitors,0,100000000))||
       (views!==null&&!integer(views,0,100000000)))bad(400,'Số liệu Cloudflare không hợp lệ.');
    seen.add(r.day);
    statements.push(db.prepare('INSERT INTO behavior_external_daily(day,visitors,page_views,source) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET visitors=excluded.visitors,page_views=excluded.page_views,source=excluded.source')
      .bind(r.day,visitors,views,'cloudflare'));
  }
  await db.batch(statements);
  return {imported:seen.size,source:'cloudflare'};
}
async function report(db,days){
  const from=Date.now()-days*DAY,to=Date.now();
  const result=await db.prepare(
    'SELECT COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS visitors, '+
    'COALESCE(SUM(page_views),0) AS pageViews, COALESCE(SUM(engaged_ms),0) AS engagedMs, '+
    'COALESCE(AVG(max_scroll),0) AS avgScroll, COALESCE(SUM(converted),0) AS conversions, '+
    'COALESCE(SUM(CASE WHEN page_views<=1 AND engaged_ms<10000 AND interactions=0 AND converted=0 THEN 1 ELSE 0 END),0) AS bounces '+
    'FROM behavior_sessions WHERE started_at>=? AND started_at<=?'
  ).bind(from,to).first();
  const daily=(await db.prepare(
    "SELECT strftime('%Y-%m-%d',started_at/1000,'unixepoch','+7 hours') AS day, "+
    'COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS visitors, SUM(converted) AS conversions '+
    'FROM behavior_sessions WHERE started_at>=? AND started_at<=? GROUP BY day ORDER BY day'
  ).bind(from,to).all()).results||[];
  const cart=await db.prepare('SELECT COUNT(*) AS total FROM behavior_cart_events WHERE created_at>=? AND created_at<=?').bind(from,to).first();
  const cartDaily=(await db.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch','+7 hours') AS day, COUNT(*) AS adds FROM behavior_cart_events WHERE created_at>=? AND created_at<=? GROUP BY day ORDER BY day").bind(from,to).all()).results||[];
  const historical=await db.prepare('SELECT COUNT(*) AS orders, COUNT(DISTINCT user_id) AS buyers FROM orders WHERE created_at>=? AND created_at<=?').bind(from,to).first();
  const historicalDaily=(await db.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch','+7 hours') AS day, COUNT(*) AS orders FROM orders WHERE created_at>=? AND created_at<=? GROUP BY day ORDER BY day").bind(from,to).all()).results||[];
  const beginDay=new Date(from+7*3600000).toISOString().slice(0,10);
  const endDay=new Date(to+7*3600000).toISOString().slice(0,10);
  const imported=(await db.prepare('SELECT day,visitors,page_views AS pageViews,source FROM behavior_external_daily WHERE day>=? AND day<=? ORDER BY day').bind(beginDay,endDay).all()).results||[];
  const count=result?.sessions||0;
  return {
    days,range:{from:new Date(from).toISOString(),to:new Date(to).toISOString(),timezone:'Asia/Ho_Chi_Minh'},
    kpis:{
      bounceRate:count?result.bounces/count*100:0,
      avgSessionSeconds:count?result.engagedMs/count/1000:0,
      pagesPerSession:count?result.pageViews/count:0,
      avgScrollDepth:result?.avgScroll||0,
      sessions:count,visitors:result?.visitors||0,
      conversionRate:count?result.conversions/count*100:0,
      conversions:result?.conversions||0,
      addToCart:cart?.total||0
    },
    historicalOrders:{orders:historical?.orders||0,buyers:historical?.buyers||0,daily:historicalDaily},
    importedAnalytics:{source:'cloudflare',daily:imported,importedDays:imported.length,
      pageViews:imported.reduce((a,r)=>a+(r.pageViews||0),0),
      dailyVisitors:imported.reduce((a,r)=>a+(r.visitors||0),0)},
    daily,cartDaily,definitions:{
      bounce:'Phiên có tối đa một lượt xem trang, dưới 10 giây tương tác, không có tương tác chủ động và không phát sinh đơn.',
      duration:'Thời gian người dùng hoạt động khi tab đang hiển thị, không phải thời gian để tab mở không hoạt động.',
      scroll:'Trung bình độ sâu cuộn lớn nhất từng đạt trong mỗi phiên.',
      conversion:'Phiên có ít nhất một đơn hàng được máy chủ tạo thành công. Một phiên có nhiều đơn chỉ được tính một lần.',
      visitors:'Số mã khách truy cập ẩn danh riêng biệt trong giai đoạn, không phải số người được xác minh.',
      period:'Khoảng thời gian trượt 7, 30 hoặc 90 ngày tính đến hiện tại.',
      addToCart:'Số sự kiện tăng giỏ hàng được lưu thành công, một thao tác được tính một lượt; không có dữ liệu lịch sử trước ngày bật.',
      history:'Đơn hàng và khách mua là số liệu thực từ D1, kể cả trước ngày bật đo lường hành vi. Dữ liệu nhập Cloudflare là theo ngày và không được cộng vào số phiên/khách riêng biệt.',
      externalVisitors:'Tổng lượt khách duy nhất theo từng ngày (có thể trùng giữa các ngày); không phải số khách duy nhất trong toàn khoảng.'
    }
  };
}
export async function recordBehaviorConversion(db,sessionId,visitorId){
  if(!UUID.test(sessionId||''))return;
  await ensureTables(db);
  const now=Date.now();
  if(UUID.test(visitorId||'')){
    await db.prepare('INSERT INTO behavior_sessions(session_id,visitor_id,started_at,updated_at,converted) VALUES(?,?,?,?,1) '+
      'ON CONFLICT(session_id) DO UPDATE SET converted=1 '+
      'WHERE behavior_sessions.visitor_id=excluded.visitor_id AND behavior_sessions.updated_at>=?')
      .bind(sessionId,visitorId,now,now,now-1800000).run();
  }else{
    await db.prepare('UPDATE behavior_sessions SET converted=1 WHERE session_id=? AND updated_at>=?')
      .bind(sessionId,now-1800000).run();
  }
}
export async function handleBehavior(req,env,user){
  const path=new URL(req.url).pathname;
  if(path!=='/api/behavior'&&path!=='/api/admin/behavior'&&path!=='/api/admin/behavior/import-history')return null;
  if(path==='/api/admin/behavior/import-history'){
    if(user?.role!=='admin')bad(403,'Bạn không có quyền quản trị.');
    if(req.method!=='POST')bad(405,'Phương thức không được hỗ trợ.');
    const raw=await req.text();
    if(raw.length>16000)bad(413,'Tệp dữ liệu quá lớn.');
    let p;try{p=JSON.parse(raw)}catch{bad(400,'Nội dung CSV không hợp lệ.')}
    await ensureTables(env.DB);
    return reply(await importHistory(env.DB,p));
  }
  if(path==='/api/admin/behavior'){
    if(user?.role!=='admin')bad(403,'Bạn không có quyền quản trị.');
    if(req.method!=='GET')bad(405,'Phương thức không được hỗ trợ.');
    const q=new URL(req.url).searchParams.get('days')||'7';
    if(!['7','30','90'].includes(q))bad(400,'Chỉ hỗ trợ khoảng 7, 30 hoặc 90 ngày.');
    await ensureTables(env.DB);
    return reply(await report(env.DB,Number(q)));
  }
  if(req.method!=='POST')bad(405,'Phương thức không được hỗ trợ.');
  if(user?.role==='admin')return reply({ok:true});
  const raw=await req.text();
  if(raw.length>1024)bad(413,'Dữ liệu quá lớn.');
  let p;try{p=JSON.parse(raw)}catch{bad(400,'Dữ liệu đo lường chưa hợp lệ.')}
  await ensureTables(env.DB);
  if(p?.eventType==='add_to_cart')await recordCartAdd(env.DB,p);
  else await recordEvent(env.DB,p);
  return reply({ok:true},202);
}
