// Anonymous first-party session analytics. Never save URL query strings, IP, email, phone, or messages.
const DAY=86400000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const initialized=new WeakSet();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function bad(status,message){const e=new Error(message);e.status=status;throw e}
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
async function ensureTables(db){
  if(initialized.has(db))return;
  await db.prepare("CREATE TABLE IF NOT EXISTS behavior_sessions (session_id TEXT PRIMARY KEY NOT NULL, visitor_id TEXT NOT NULL, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, engaged_ms INTEGER NOT NULL DEFAULT 0, page_views INTEGER NOT NULL DEFAULT 0, max_scroll INTEGER NOT NULL DEFAULT 0, interactions INTEGER NOT NULL DEFAULT 0, converted INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare('CREATE INDEX IF NOT EXISTS behavior_sessions_started ON behavior_sessions(started_at)').run();
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
  if(Math.random()<0.005)await db.prepare('DELETE FROM behavior_sessions WHERE started_at<?').bind(now-120*DAY).run();
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
      conversions:result?.conversions||0
    },daily,definitions:{
      bounce:'Phiên có tối đa một lượt xem trang, dưới 10 giây tương tác, không có tương tác chủ động và không phát sinh đơn.',
      duration:'Thời gian người dùng hoạt động khi tab đang hiển thị, không phải thời gian để tab mở không hoạt động.',
      scroll:'Trung bình độ sâu cuộn lớn nhất từng đạt trong mỗi phiên.',
      conversion:'Phiên có ít nhất một đơn hàng được máy chủ tạo thành công. Một phiên có nhiều đơn chỉ được tính một lần.',
      visitors:'Số mã khách truy cập ẩn danh riêng biệt trong giai đoạn, không phải số người được xác minh.',
      period:'Khoảng thời gian trượt 7, 30 hoặc 90 ngày tính đến hiện tại; số liệu bắt đầu từ ngày kích hoạt.'
    }
  };
}
export async function recordBehaviorConversion(db,sessionId){
  if(!UUID.test(sessionId||''))return;
  await ensureTables(db);
  await db.prepare('UPDATE behavior_sessions SET converted=1 WHERE session_id=? AND updated_at>=?')
    .bind(sessionId,Date.now()-1800000).run();
}
export async function handleBehavior(req,env,user){
  const path=new URL(req.url).pathname;
  if(path!=='/api/behavior'&&path!=='/api/admin/behavior')return null;
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
  await recordEvent(env.DB,p);
  return reply({ok:true},202);
}
