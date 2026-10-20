/* ImPrint: first-party visitor metrics and the admin User Behavior dashboard. */
(function(){
  'use strict';
  const DAY=86400000;
  const STATE='imprint_behavior_session_v1',VISITOR='imprint_behavior_visitor_v1';
  let current=null,visitor=null,engaged=0,pageViews=0,interactions=0,maxScroll=0,lastInput=Date.now(),previousRoute='',requestId=0,selectedDays=7;
  const adminView=()=>/^admin\./i.test(location.hostname)||/^#admin(?:$|[-/?])/i.test(location.hash)||
    (typeof user!=='undefined'&&user?.role==='admin');
  const getItem=(s,k)=>{try{return s.getItem(k)}catch{return null}};
  const putItem=(s,k,v)=>{try{s.setItem(k,v)}catch{}};
  const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v||'');
  function openSession(){
    if(adminView()||navigator.doNotTrack==='1')return;
    visitor=getItem(localStorage,VISITOR);
    if(!uuid(visitor)){visitor=crypto.randomUUID();putItem(localStorage,VISITOR,visitor)}
    let cached=null;
    try{cached=JSON.parse(getItem(sessionStorage,STATE)||'null')}catch{}
    if(!cached||!uuid(cached.id)||Date.now()-(Number(cached.lastSeen)||0)>1800000||Date.now()<cached.lastSeen){
      cached={id:crypto.randomUUID(),lastSeen:Date.now()};
    }
    current=cached;
    putItem(sessionStorage,STATE,JSON.stringify(current));
    previousRoute=location.pathname+location.hash;
    pageViews=1;
    flush();
  }
  function flush(beacon=false){
    if(!current||adminView()||!visitor)return;
    if(!pageViews&&!engaged&&!interactions&&maxScroll===0)return;
    const payload={sessionId:current.id,visitorId:visitor,pageViews:Math.min(1,pageViews),
      engagedMs:Math.min(60000,engaged),scrollDepth:Math.min(100,maxScroll),
      interactions:Math.min(100,interactions)};
    pageViews=Math.max(0,pageViews-1);engaged=0;interactions=0;maxScroll=0;
    current.lastSeen=Date.now();putItem(sessionStorage,STATE,JSON.stringify(current));
    const json=JSON.stringify(payload);
    if(beacon&&navigator.sendBeacon){
      try{if(navigator.sendBeacon('/api/behavior',new Blob([json],{type:'application/json'})))return}catch{}
    }
    fetch('/api/behavior',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:json,keepalive:beacon}).catch(()=>{});
  }
  function onActivity(interaction=false){
    if(!current||adminView())return;
    lastInput=Date.now();
    if(interaction)interactions=Math.min(100,interactions+1);
  }
  function updateScroll(){
    onActivity(true);
    if(!current)return;
    const doc=document.documentElement;
    const total=Math.max(doc.scrollHeight,document.body?.scrollHeight||0);
    if(total>0)maxScroll=Math.max(maxScroll,Math.min(100,Math.round((scrollY+innerHeight)/total*100)));
  }
  function newView(){
    if(!current||adminView())return;
    const route=location.pathname+location.hash;
    if(route===previousRoute)return;
    previousRoute=route;
    pageViews++;
    flush();
  }
  function cartCounts(){
    const entries=typeof data!=='undefined'&&Array.isArray(data?.cart)?data.cart:[];
    const result=new Map();
    for(const item of entries){
      const key=String(item.id||item.product?.id||'unknown');
      result.set(key,(result.get(key)||0)+Math.max(0,Number(item.qty)||0));
    }
    return result;
  }
  let lastCart=null,ignoreCartPersist=false;
  function emitAddToCart(){
    if(!current||!visitor||adminView())return;
    const p={eventType:'add_to_cart',eventId:crypto.randomUUID(),sessionId:current.id,visitorId:visitor};
    fetch('/api/behavior',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(()=>{});
  }
  window.ImprintBehavior={
    sessionId:()=>current&&!adminView()?current.id:null,
    visitorId:()=>current&&!adminView()?visitor:null,
    baselineCart:()=>{lastCart=cartCounts()},
    ignoreNextCartPersist:()=>{ignoreCartPersist=true}
  };
  if(typeof persist==='function'){
    const originalPersist=persist;
    persist=function(){
      const next=cartCounts();
      const additions=lastCart&&[...next].some(([id,qty])=>qty>(lastCart.get(id)||0));
      const ignore=ignoreCartPersist;ignoreCartPersist=false;
      lastCart=next;
      return Promise.resolve(originalPersist.apply(this,arguments)).then(result=>{
        if(result!==false&&additions&&!ignore)emitAddToCart();
        return result;
      });
    };
  }
  window.addEventListener('pointerdown',()=>onActivity(true),{passive:true});
  window.addEventListener('keydown',()=>onActivity(true),{passive:true});
  window.addEventListener('scroll',updateScroll,{passive:true});
  window.addEventListener('hashchange',newView);
  window.addEventListener('pagehide',()=>flush(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush(true);else lastInput=Date.now()});
  setInterval(()=>{if(current&&!adminView()&&document.visibilityState==='visible'&&document.hasFocus()&&Date.now()-lastInput<30000)engaged=Math.min(60000,engaged+1000)},1000);
  setInterval(()=>{if(current&&Date.now()-current.lastSeen>1800000){flush();current=null;openSession()}else flush()},15000);

  function addStyle(){
    if(document.getElementById('ip-behavior-css'))return;
    const sheet=document.createElement('style');sheet.id='ip-behavior-css';
    sheet.textContent=[
      '.ip-behavior{font:inherit;box-sizing:border-box;max-width:1200px;margin:28px auto 48px;padding:26px;background:#fffdfa;color:var(--ink,#302b29);border:1px solid var(--line,#e4dbd5);border-radius:20px;box-shadow:0 10px 30px #38231c0b}',
      '.ip-behavior *{box-sizing:border-box}',
      '.ip-behavior-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:22px}',
      '.ip-behavior-kicker{font-size:11px;letter-spacing:.15em;font-weight:700;text-transform:uppercase;color:#92756e}',
      '.ip-behavior h2{color:var(--ink,#302b29);font-size:clamp(24px,3vw,30px);line-height:1.2;margin:7px 0 0;font-weight:650;letter-spacing:-.035em}',
      '.ip-behavior-sub{color:var(--muted,#746964);font-size:13px;line-height:1.6;margin:9px 0 0;max-width:660px}',
      '.ip-behavior-filters{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:5px;border:1px solid var(--line,#e5dcd6);background:#f8f4f1;border-radius:12px}',
      '.ip-behavior-filter,.ip-behavior-refresh{font:inherit;cursor:pointer;border:0;background:transparent;border-radius:8px;font-size:12px;padding:9px 12px;color:#786a64;font-weight:650;white-space:nowrap}',
      '.ip-behavior-filter[aria-pressed="true"]{background:#322926;color:#fff;box-shadow:0 2px 7px #25191520}',
      '.ip-behavior-filter:focus-visible,.ip-behavior-refresh:focus-visible,.ip-behavior-import:focus-visible{outline:2px solid #a26e70;outline-offset:2px}',
      '.ip-behavior-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:24px}',
      '.ip-behavior-metric{padding:17px 16px 16px;background:#fbf8f5;border:1px solid var(--line,#e8dfd9);border-radius:14px;min-height:106px}',
      '.ip-behavior-number{font-weight:650;color:#372e2b;font-size:clamp(23px,2.9vw,31px);letter-spacing:-.035em;font-variant-numeric:tabular-nums;line-height:1.3}',
      '.ip-behavior-label{margin-top:9px;color:#81726a;font-size:11px;font-weight:600;letter-spacing:.02em;line-height:1.45}',
      '.ip-behavior-tag{font-size:10px;display:inline-block;margin-top:9px;color:#8b625a;background:#f4ece7;padding:3px 7px;border-radius:6px}',
      '.ip-behavior-status{min-height:20px;color:var(--muted,#83746e);font-size:12px;margin:14px 0 0;line-height:1.5}',
      '.ip-behavior-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:20px}',
      '.ip-behavior-chart-card{border:1px solid var(--line,#e8dfd9);border-radius:15px;padding:18px;background:#fff}',
      '.ip-behavior-chart-card h3{font-size:14px;line-height:1.4;color:#392c29;margin:0 0 6px;font-weight:700}',
      '.ip-behavior-hint{font-size:12px;line-height:1.6;color:#897b75;margin:0 0 13px}',
      '.ip-behavior-chart{height:110px;border-bottom:1px solid #e7dcd5;display:flex;align-items:flex-end;gap:2px}',
      '.ip-behavior-bar{flex:1;min-width:1px;background:#9b7770;border-radius:3px 3px 0 0}',
      '.ip-behavior-bar.is-order{background:#d1a9a0}',
      '.ip-behavior-external{margin-top:18px;padding:16px 18px;border-radius:14px;background:#faf7f3;border:1px solid var(--line,#e8dfd9)}',
      '.ip-behavior-external-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
      '.ip-behavior-external strong{display:block;font-size:13px;color:#463936}',
      '.ip-behavior-external p{font-size:12px;color:#80716b;line-height:1.7;margin:6px 0}',
      '.ip-behavior-import{font:inherit;background:#362c28;color:white;border:1px solid #362c28;cursor:pointer;border-radius:9px;font-size:12px;font-weight:650;padding:10px 13px}',
      '.ip-behavior-import:hover{background:#5b433c}',
      '.ip-behavior-import:disabled{opacity:.55;cursor:wait}',
      '.ip-behavior-mini{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0;font-size:12px;color:#5d504b}',
      '.ip-behavior-mini b{font-weight:700;color:#382e2a}',
      '@media(max-width:950px){.ip-behavior-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:660px){.ip-behavior{padding:17px;margin:20px auto;border-radius:15px}.ip-behavior-grid{gap:9px}.ip-behavior-metric{padding:12px;min-height:94px}.ip-behavior-charts{grid-template-columns:1fr}.ip-behavior-number{font-size:26px}}'
    ].join('\n');
    document.head.appendChild(sheet);
  }
  const metrics=[
    ['sessions','Phiên truy cập','Đo từ ngày bật'],
    ['visitors','Khách truy cập','Ẩn danh · từ ngày bật'],
    ['pageViewsPerSession','Trang / phiên','Đo từ ngày bật'],
    ['avgSessionSeconds','Thời gian hoạt động','Đo từ ngày bật'],
    ['bounceRate','Tỷ lệ thoát','Đo từ ngày bật'],
    ['avgScrollDepth','Độ sâu cuộn trang','Đo từ ngày bật'],
    ['addToCart','Lượt thêm vào giỏ','Đo từ ngày bật'],
    ['conversionRate','Chuyển đổi / phiên','Đo từ ngày bật'],
    ['orders','Đơn đã đặt','Lịch sử D1'],
    ['buyers','Tài khoản đã đặt','Lịch sử D1']
  ];
  function mount(){
    if(typeof app==='undefined'||typeof user==='undefined'||user?.role!=='admin')return;
    if(document.getElementById('ip-behavior'))return;
    addStyle();
    const section=document.createElement('section');section.id='ip-behavior';section.className='ip-behavior';
    section.setAttribute('aria-label','Phân tích hành vi người dùng ImPrint');
    section.innerHTML='<div class="ip-behavior-top"><div><div class="ip-behavior-kicker">IMPRINT / QUẢN TRỊ / BÁO CÁO</div>'+
      '<h2>Hành vi khách truy cập</h2>'+
      '<p class="ip-behavior-sub">Thống kê ẩn danh theo hoạt động thực tế. Số liệu đơn hàng lấy trực tiếp từ hệ thống ImPrint.</p></div>'+
      '<div class="ip-behavior-filters" role="group" aria-label="Chọn khoảng thời gian">'+
      [7,30,90].map(d=>'<button type="button" class="ip-behavior-filter" data-days="'+d+'" aria-pressed="'+(selectedDays===d)+'">'+d+' ngày</button>').join('')+
      '<button type="button" class="ip-behavior-refresh" aria-label="Làm mới báo cáo" title="Làm mới">↻</button></div></div>'+
      '<div class="ip-behavior-grid">'+metrics.map(([key,label,tag])=>'<div class="ip-behavior-metric"><div class="ip-behavior-number" data-value="'+key+'">—</div>'+
        '<div class="ip-behavior-label">'+label+'</div><span class="ip-behavior-tag">'+tag+'</span></div>').join('')+'</div>'+
      '<p class="ip-behavior-status" role="status" aria-live="polite">Đang lấy dữ liệu…</p>'+
      '<div class="ip-behavior-charts">'+
       '<div class="ip-behavior-chart-card"><h3>Phiên truy cập theo ngày</h3><p class="ip-behavior-hint">Dữ liệu đo lường trực tiếp, không ước tính lịch sử</p><div class="ip-behavior-chart" data-chart="sessions" role="img"></div></div>'+
       '<div class="ip-behavior-chart-card"><h3>Đơn hàng theo ngày</h3><p class="ip-behavior-hint">Lịch sử đơn hàng xác thực trong D1</p><div class="ip-behavior-chart" data-chart="orders" role="img"></div></div></div>'+
      '<div class="ip-behavior-external"><div class="ip-behavior-external-head"><div><strong>Lịch sử Cloudflare Analytics</strong>'+
       '<p>Nhập dữ liệu xuất từ Cloudflare Web Analytics để bổ sung số lượt xem trang và lượt khách theo ngày. Không trộn vào chỉ số phiên truy cập.</p></div>'+
       '<button type="button" class="ip-behavior-import">Nhập Cloudflare CSV</button><input type="file" hidden accept=".csv,text/csv" class="ip-behavior-file"></div>'+
      '<div class="ip-behavior-mini"><span>Ngày đã nhập: <b data-historical="days">—</b></span>'+
        '<span>Tổng lượt xem trang/ngày: <b data-historical="views">—</b></span>'+
        '<span>Tổng khách duy nhất theo ngày: <b data-historical="visitors">—</b></span></div>'+
      '<p class="ip-behavior-hint">CSV gồm cột date, visitors, pageViews (mỗi dòng một ngày). Khách duy nhất từng ngày có thể trùng qua nhiều ngày, không phải khách duy nhất 30 ngày. Chỉ nhập dữ liệu từ nguồn xác thực.</p></div>';
    app.appendChild(section);
    section.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{
      selectedDays=Number(b.dataset.days);
      section.querySelectorAll('[data-days]').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.days)===selectedDays)));
      load(section);
    }));
    section.querySelector('.ip-behavior-refresh').addEventListener('click',()=>load(section));
    const pick=section.querySelector('.ip-behavior-import'),input=section.querySelector('.ip-behavior-file');
    pick.addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;
      pick.disabled=true;
      try{
        if(file.size>16000)throw Error('CSV quá lớn: tối đa 16 KB.');
        const rows=parseHistoryCSV(await file.text());
        const response=await fetch('/api/admin/behavior/import-history',{
          method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({source:'cloudflare',rows})
        });
        const json=await response.json();
        if(!response.ok)throw Error(json.error||'Không nhập được dữ liệu.');
        await load(section);
        section.querySelector('.ip-behavior-status').textContent='Đã cập nhật '+json.imported+' ngày từ CSV Cloudflare.';
      }catch(e){section.querySelector('.ip-behavior-status').textContent=e.message}
      finally{pick.disabled=false;input.value=''}
    });
    load(section);
  }
  function parseHistoryCSV(csv){
    // Quoted commas are supported; exported CSV must explicitly identify unique visitors and page views.
    const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
    if(lines.length<2||lines.length>101)throw Error('CSV phải chứa 1–100 ngày thống kê.');
    function split(line){
      const cells=[];let current='',quoted=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++}else quoted=!quoted}
        else if(ch===','&&!quoted){cells.push(current.trim());current=''}
        else current+=ch;
      }
      if(quoted)throw Error('Dấu ngoặc kép trong CSV không hợp lệ.');
      cells.push(current.trim());return cells;
    }
    const columns=split(lines[0]).map(x=>x.toLowerCase().replace(/[\s_-]/g,''));
    const day=columns.findIndex(x=>x==='date'||x==='day'),visitors=columns.findIndex(x=>x==='visitors'||x==='uniquevisitors'),views=columns.findIndex(x=>x==='pageviews');
    if(day<0||(visitors<0&&views<0))throw Error('CSV cần cột date và visitors và/hoặc pageViews (không dùng request thay page view).');
    return lines.slice(1).map(line=>{
      const cols=split(line);
      const numberAt=i=>{if(i<0||cols[i]==='')return null;const n=Number(cols[i]);if(!Number.isInteger(n)||n<0)throw Error('Giá trị đếm phải là số nguyên không âm.');return n};
      return {day:cols[day],visitors:numberAt(visitors),pageViews:numberAt(views)};
    });
  }
  const fmt=(n,d=0)=>Number(n||0).toLocaleString('vi-VN',{minimumFractionDigits:d,maximumFractionDigits:d});
  function duration(s){const n=Math.max(0,Math.round(s||0));return n>=60?Math.floor(n/60)+' phút '+String(n%60).padStart(2,'0')+' giây':n+' giây'}
  function drawChart(el,source,key,days,klass=''){
    el.replaceChildren();
    const map=new Map((source||[]).map(item=>[item.day,Number(item[key])||0]));
    const current=new Date(Date.now()+7*3600000);
    const midnight=Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate());
    const values=[];
    for(let i=days-1;i>=0;i--){const day=new Date(midnight-i*DAY).toISOString().slice(0,10);values.push({day,value:map.get(day)||0})}
    const ceiling=Math.max(1,...values.map(v=>v.value));
    for(const entry of values){
      const bar=document.createElement('div');bar.className='ip-behavior-bar '+klass;
      bar.style.height=(entry.value?Math.max(4,entry.value/ceiling*100):0)+'%';
      bar.title=entry.day+': '+fmt(entry.value);el.appendChild(bar);
    }
    el.setAttribute('aria-label',values.map(x=>x.day+': '+x.value).join('; '));
  }
  async function load(section){
    const id=++requestId,days=selectedDays;
    const status=section.querySelector('.ip-behavior-status');status.textContent='Đang cập nhật dữ liệu '+days+' ngày…';
    try{
      const response=await fetch('/api/admin/behavior?days='+days,{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw Error(response.status===403?'Vui lòng đăng nhập lại bằng tài khoản quản trị.':'Không lấy được thống kê (HTTP '+response.status+').');
      const data=await response.json();
      if(requestId!==id||!section.isConnected)return;
      const k=data.kpis,history=data.historicalOrders,external=data.importedAnalytics;
      const values={
        sessions:fmt(k.sessions),visitors:fmt(k.visitors),
        pageViewsPerSession:fmt(k.pagesPerSession,2),avgSessionSeconds:duration(k.avgSessionSeconds),
        bounceRate:fmt(k.bounceRate,1)+'%',avgScrollDepth:fmt(k.avgScrollDepth,1)+'%',
        addToCart:fmt(k.addToCart),conversionRate:fmt(k.conversionRate,1)+'%',
        orders:fmt(history.orders),buyers:fmt(history.buyers)
      };
      for(const [key,value]of Object.entries(values))section.querySelector('[data-value="'+key+'"]').textContent=value;
      drawChart(section.querySelector('[data-chart="sessions"]'),data.daily,'sessions',days);
      drawChart(section.querySelector('[data-chart="orders"]'),history.daily,'orders',days,'is-order');
      section.querySelector('[data-historical="days"]').textContent=fmt(external.importedDays);
      section.querySelector('[data-historical="views"]').textContent=external.importedDays?fmt(external.pageViews):'Chưa có dữ liệu';
      section.querySelector('[data-historical="visitors"]').textContent=external.importedDays?fmt(external.dailyVisitors):'Chưa có dữ liệu';
      status.textContent='Báo cáo '+days+' ngày · Đơn hàng lấy từ D1; hành vi và thêm giỏ bắt đầu từ khi bật theo dõi. Không suy diễn dữ liệu cũ.';
    }catch(e){if(requestId===id&&section.isConnected)status.textContent=e.message}
  }
  if(typeof admin==='function'){
    const original=admin;
    admin=function(){const result=original.apply(this,arguments);mount();return result};
  }
  setTimeout(openSession,0);
})();
