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
  // A separately sourced, overwrite-safe recovered log. Never insert reconstructed
  // records into live behavior_sessions: trackers have incomparable visitor IDs.
  await db.prepare("CREATE TABLE IF NOT EXISTS behavior_recovered_log (source TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, imported_at INTEGER NOT NULL)").bind().run();
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
async function importRecoveredSessions(db,body){
  if(!body||body.source!=='imprint-workbook'||!Array.isArray(body.rows)||
     body.rows.length<1||body.rows.length>2000)bad(400,'Nhật ký phiên không hợp lệ (tối đa 2.000 phiên).');
  const now=Date.now(),today=new Date(now+7*3600000).toISOString().slice(0,10);
  const sessionIds=new Set(),visitors=new Set(),clean=[],dayCounts=new Map();
  for(const r of body.rows){
    if(!r||typeof r.day!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.day)||
       !Number.isFinite(Date.parse(r.day+'T00:00:00Z'))||
       new Date(r.day+'T00:00:00Z').toISOString().slice(0,10)!==r.day||
       r.day>today||Date.parse(r.day+'T00:00:00Z')<now-91*DAY||
       typeof r.sessionId!=='string'||!/^[-A-Za-z0-9_]{4,64}$/.test(r.sessionId)||
       typeof r.visitorId!=='string'||!/^[-A-Za-z0-9_]{4,64}$/.test(r.visitorId)||
       sessionIds.has(r.sessionId)||!integer(r.pageViews,0,1000)||
       !integer(r.engagementSeconds,0,86400)||!integer(r.bounced,0,1)||
       !Number.isFinite(r.scrollDepth)||r.scrollDepth<0||r.scrollDepth>100||
       !integer(r.addToCart,0,1000)||!integer(r.converted,0,1)){
      bad(400,'Dữ liệu nhật ký phiên không hợp lệ hoặc trùng mã phiên.');
    }
    sessionIds.add(r.sessionId);visitors.add(r.visitorId);
    dayCounts.set(r.day,(dayCounts.get(r.day)||0)+1);
    clean.push([r.day,r.sessionId,r.visitorId,r.pageViews,r.engagementSeconds,r.bounced,
      r.scrollDepth,r.addToCart,r.converted]);
  }
  if(dayCounts.size>91)bad(400,'Khoảng ngày khôi phục quá dài.');
  const payload=JSON.stringify(clean);
  if(payload.length>300000)bad(413,'Nhật ký khôi phục quá lớn.');
  await db.prepare("INSERT INTO behavior_recovered_log(source,payload,imported_at) VALUES('imprint-workbook',?,?) ON CONFLICT(source) DO UPDATE SET payload=excluded.payload,imported_at=excluded.imported_at")
    .bind(payload,now).run();
  return {imported:clean.length,visitors:visitors.size,days:dayCounts.size,source:'imprint-workbook'};
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
    'COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS visitors, COALESCE(SUM(page_views),0) AS pageViews, SUM(converted) AS conversions '+
    'FROM behavior_sessions WHERE started_at>=? AND started_at<=? GROUP BY day ORDER BY day'
  ).bind(from,to).all()).results||[];
  const cart=await db.prepare('SELECT COUNT(*) AS total FROM behavior_cart_events WHERE created_at>=? AND created_at<=?').bind(from,to).first();
  const cartDaily=(await db.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch','+7 hours') AS day, COUNT(*) AS adds FROM behavior_cart_events WHERE created_at>=? AND created_at<=? GROUP BY day ORDER BY day").bind(from,to).all()).results||[];
  const historical=await db.prepare('SELECT COUNT(*) AS orders, COUNT(DISTINCT user_id) AS buyers FROM orders WHERE created_at>=? AND created_at<=?').bind(from,to).first();
  const historicalDaily=(await db.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch','+7 hours') AS day, COUNT(*) AS orders FROM orders WHERE created_at>=? AND created_at<=? GROUP BY day ORDER BY day").bind(from,to).all()).results||[];
  const beginDay=new Date(from+7*3600000).toISOString().slice(0,10);
  const endDay=new Date(to+7*3600000).toISOString().slice(0,10);
  const imported=(await db.prepare('SELECT day,visitors,page_views AS pageViews,source FROM behavior_external_daily WHERE day>=? AND day<=? ORDER BY day').bind(beginDay,endDay).all()).results||[];
  // Merge at day level: an imported Cloudflare count replaces the first-party
  // count for the same day and metric. Never add two trackers for an overlap.
  // Daily distinct visitors can repeat across dates; they are not period uniques.
  const mergedMap=new Map(daily.map(r=>[r.day,{
    day:r.day,sessions:r.sessions||0,visitors:r.visitors||0,pageViews:r.pageViews||0,
    importedVisitors:false,importedPageViews:false
  }]));
  let overlapDays=0;
  for(const r of imported){
    const existing=mergedMap.get(r.day);
    if(existing)overlapDays++;
    const combined=existing||{day:r.day,sessions:0,visitors:0,pageViews:0,importedVisitors:false,importedPageViews:false};
    if(r.visitors!==null&&r.visitors!==undefined){combined.visitors=r.visitors;combined.importedVisitors=true}
    if(r.pageViews!==null&&r.pageViews!==undefined){combined.pageViews=r.pageViews;combined.importedPageViews=true}
    mergedMap.set(r.day,combined);
  }
  const mergedDaily=[...mergedMap.values()].sort((a,b)=>a.day.localeCompare(b.day));
  const historicalLog=await db.prepare("SELECT payload FROM behavior_recovered_log WHERE source='imprint-workbook'").first();
  const recoveredRows=historicalLog?JSON.parse(historicalLog.payload):[];
  const covered=new Set(),historyVisitors=new Set(),historyDaily=new Map();
  const historyTotals={sessions:0,pageViews:0,engagedMs:0,bounces:0,scrollSum:0,conversions:0,addToCart:0};
  for(const r of recoveredRows){
    const [day,sessionId,visitorId,views,seconds,bounced,scroll,adds,converted]=r;
    // The recovered source is calendar-day based, unlike the live rolling window.
    if(day<beginDay||day>endDay)continue;
    covered.add(day);historyVisitors.add(visitorId);
    const d=historyDaily.get(day)||{day,sessions:0,visitors:0,pageViews:0,engagedMs:0,bounces:0,scrollSum:0,conversions:0,addToCart:0,ids:new Set()};
    d.sessions++;d.pageViews+=views;d.engagedMs+=seconds*1000;
    d.bounces+=bounced;d.scrollSum+=scroll;d.conversions+=converted;
    d.addToCart+=adds;d.ids.add(visitorId);historyDaily.set(day,d);
    historyTotals.sessions++;historyTotals.pageViews+=views;historyTotals.engagedMs+=seconds*1000;
    historyTotals.bounces+=bounced;historyTotals.scrollSum+=scroll;
    historyTotals.conversions+=converted;historyTotals.addToCart+=adds;
  }
  const recoveredDaily=[...historyDaily.values()].map(d=>({
    day:d.day,sessions:d.sessions,visitors:d.ids.size,pageViews:d.pageViews,
    importedVisitors:true,importedPageViews:true
  }));
  for(const r of recoveredDaily)mergedMap.set(r.day,r);
  // Cloudflare daily values are the preferred source for the two fields that
  // both trackers report, without multiplying same-day counts.
  for(const r of imported){
    const d=mergedMap.get(r.day);
    if(!d)continue;
    if(r.visitors!==null&&r.visitors!==undefined){d.visitors=r.visitors;d.importedVisitors=true}
    if(r.pageViews!==null&&r.pageViews!==undefined){d.pageViews=r.pageViews;d.importedPageViews=true}
  }
  const mergedDailyFinal=[...mergedMap.values()].sort((a,b)=>a.day.localeCompare(b.day));
  let combinedKpis=null;
  if(covered.size){
    const dayExpr="strftime('%Y-%m-%d',started_at/1000,'unixepoch','+7 hours')";
    const unavailable=[...covered];
    const liveWhere=unavailable.length?' AND '+dayExpr+' NOT IN ('+unavailable.map(()=>'?').join(',')+')':'';
    const live=await db.prepare(
      'SELECT COUNT(*) sessions,COUNT(DISTINCT visitor_id) visitors,COALESCE(SUM(page_views),0) pageViews,'+
      'COALESCE(SUM(engaged_ms),0) engagedMs,COALESCE(SUM(max_scroll),0) scrollSum,'+
      'COALESCE(SUM(converted),0) conversions,'+
      'COALESCE(SUM(CASE WHEN page_views<=1 AND engaged_ms<10000 AND interactions=0 AND converted=0 THEN 1 ELSE 0 END),0) bounces '+
      'FROM behavior_sessions WHERE started_at>=? AND started_at<=?'+liveWhere
    ).bind(from,to,...unavailable).first();
    const addOutside=(cartDaily||[]).filter(r=>!covered.has(r.day)).reduce((a,r)=>a+r.adds,0);
    const sessions=historyTotals.sessions+(live?.sessions||0);
    const visitors=historyVisitors.size+(live?.visitors||0);
    combinedKpis={
      sessions,visitors,
      pagesPerSession:sessions?(historyTotals.pageViews+(live?.pageViews||0))/sessions:0,
      avgSessionSeconds:sessions?(historyTotals.engagedMs+(live?.engagedMs||0))/sessions/1000:0,
      bounceRate:sessions?(historyTotals.bounces+(live?.bounces||0))/sessions*100:0,
      avgScrollDepth:sessions?(historyTotals.scrollSum+(live?.scrollSum||0))/sessions:0,
      addToCart:historyTotals.addToCart+addOutside,
      conversionRate:sessions?(historyTotals.conversions+(live?.conversions||0))/sessions*100:0,
      historicalVisitors:historyVisitors.size,liveVisitorsOutsideHistory:live?.visitors||0,
      sourceMixed:(live?.sessions||0)>0
    };
  }
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
    combinedKpis,
    recoveredSessions:{
      sessions:historyTotals.sessions,visitors:historyVisitors.size,
      days:covered.size,available:!!historicalLog
    },
    mergedSessionsDaily:[...new Map([...daily.map(r=>[r.day,{...r}]),...recoveredDaily.map(r=>[r.day,r])]).values()].sort((a,b)=>a.day.localeCompare(b.day)),
    mergedAnalytics:{
      daily:mergedDailyFinal,daysWithData:mergedDailyFinal.length,importedDays:imported.length,overlapDays,
      pageViews:mergedDailyFinal.reduce((a,r)=>a+r.pageViews,0),
      dailyVisitors:mergedDailyFinal.reduce((a,r)=>a+r.visitors,0)
    },
    daily,cartDaily,definitions:{
      bounce:'Phiên có tối đa một lượt xem trang, dưới 10 giây tương tác, không có tương tác chủ động và không phát sinh đơn.',
      duration:'Thời gian người dùng hoạt động khi tab đang hiển thị, không phải thời gian để tab mở không hoạt động.',
      scroll:'Trung bình độ sâu cuộn lớn nhất từng đạt trong mỗi phiên.',
      conversion:'Phiên có ít nhất một đơn hàng được máy chủ tạo thành công. Một phiên có nhiều đơn chỉ được tính một lần.',
      visitors:'Số mã khách truy cập ẩn danh riêng biệt trong giai đoạn, không phải số người được xác minh.',
      period:'Khoảng thời gian trượt 7, 30 hoặc 90 ngày tính đến hiện tại.',
      addToCart:'Số sự kiện tăng giỏ hàng được lưu thành công, một thao tác được tính một lượt; không có dữ liệu lịch sử trước ngày bật.',
      history:'Đơn hàng và khách mua là số liệu từ D1. Lượt xem trang và khách theo ngày được ghép theo ngày: chỉ số Cloudflare đã nhập ưu tiên trên cùng ngày, không cộng trùng chỉ số từ đo trực tiếp. Số phiên và khách duy nhất toàn kỳ vẫn chỉ tính từ đo trực tiếp.',
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
  if(path!=='/api/behavior'&&path!=='/api/admin/behavior'&&path!=='/api/admin/behavior/import-history'&&path!=='/api/admin/behavior/import-sessions')return null;
  if(path==='/api/admin/behavior/import-sessions'){
    if(user?.role!=='admin')bad(403,'Bạn không có quyền quản trị.');
    if(req.method!=='POST')bad(405,'Phương thức không được hỗ trợ.');
    const raw=await req.text();
    if(raw.length>300000)bad(413,'Nhật ký CSV quá lớn.');
    let p;try{p=JSON.parse(raw)}catch{bad(400,'Nội dung nhật ký không hợp lệ.')}
    await ensureTables(env.DB);
    return reply(await importRecoveredSessions(env.DB,p));
  }
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
