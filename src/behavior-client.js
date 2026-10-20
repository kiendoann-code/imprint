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
  window.ImprintBehavior={sessionId:()=>current&&!adminView()?current.id:null};
  window.addEventListener('pointerdown',()=>onActivity(true),{passive:true});
  window.addEventListener('keydown',()=>onActivity(true),{passive:true});
  window.addEventListener('scroll',updateScroll,{passive:true});
  window.addEventListener('hashchange',newView);
  window.addEventListener('pagehide',()=>flush(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush(true);else lastInput=Date.now()});
  setInterval(()=>{if(current&&!adminView()&&document.visibilityState==='visible'&&document.hasFocus()&&Date.now()-lastInput<30000)engaged=Math.min(60000,engaged+1000)},1000);
  setInterval(()=>{if(current&&Date.now()-current.lastSeen>1800000){flush();current=null;openSession()}else flush()},15000);

  const styles=String.raw;
  function addStyle(){
    if(document.getElementById('ip-behavior-css'))return;
    const style=document.createElement('style');
    style.id='ip-behavior-css';
    style.textContent=[
      '.ip-behavior{box-sizing:border-box;max-width:1450px;margin:36px auto 50px;padding:26px 28px 30px;background:#061f2b;color:#fff;border-radius:12px;font:inherit}',
      '.ip-behavior *{box-sizing:border-box}',
      '.ip-behavior-top{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}',
      '.ip-behavior-kicker{font-size:11px;letter-spacing:2px;font-weight:800;color:#7bdfdf}',
      '.ip-behavior h2{margin:4px 0 0;font-size:clamp(24px,3vw,35px);font-weight:500;line-height:1.25;color:white;letter-spacing:-.02em}',
      '.ip-behavior-sub{margin:12px 0 0;font-size:12px;color:#9ac2d2}',
      '.ip-behavior-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.ip-behavior-filter,.ip-behavior-refresh{padding:9px 12px;background:transparent;border:1px solid #244353;border-radius:5px;color:#e9f3f7;font-size:11px;letter-spacing:.04em;font-weight:800;cursor:pointer}',
      '.ip-behavior-filter[aria-pressed="true"]{background:#7bd9d5;border-color:#7bd9d5;color:#02252e}',
      '.ip-behavior-filter:focus-visible,.ip-behavior-refresh:focus-visible{outline:2px solid #7bd9d5;outline-offset:3px}',
      '.ip-behavior-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-top:19px}',
      '.ip-behavior-metric{min-height:96px;padding:18px 16px 14px;border:1px solid #244452;border-radius:5px;background:#0b2b37}',
      '.ip-behavior-number{font-size:clamp(25px,2.8vw,34px);font-weight:400;letter-spacing:-1.3px;font-variant-numeric:tabular-nums;color:white;line-height:1.2}',
      '.ip-behavior-label{margin-top:6px;color:#78b5c7;font-size:10px;letter-spacing:1.1px;font-weight:700;text-transform:uppercase}',
      '.ip-behavior-caption{margin:19px 0 0;color:#c6dde7;font-size:12px;line-height:1.7}',
      '.ip-behavior-summary{margin-top:20px;border-top:1px solid #244452;padding-top:17px}',
      '.ip-behavior-summary h3{margin:0 0 14px;font-size:15px;font-weight:600;color:#e2f0f4}',
      '.ip-behavior-chart{height:95px;display:flex;gap:3px;align-items:flex-end;border-bottom:1px solid #406070}',
      '.ip-behavior-bar{flex:1;min-width:2px;background:#68ccc7;border-radius:3px 3px 0 0;opacity:.9}',
      '.ip-behavior-hint{font-size:11px;line-height:1.7;margin:12px 0 0;color:#a4c6d2}',
      '.ip-behavior-status{margin:9px 0 0;min-height:18px;font-size:12px;color:#b9d3dd}',
      '@media(max-width:900px){.ip-behavior-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ip-behavior{padding:22px 16px}}',
      '@media(max-width:520px){.ip-behavior-grid{grid-template-columns:1fr}.ip-behavior-metric{min-height:82px}.ip-behavior-top{align-items:flex-start}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  const items=[
    ['bounceRate','BOUNCE RATE'],['avgSessionSeconds','AVG SESSION DURATION'],
    ['pagesPerSession','PAGES / SESSION'],['avgScrollDepth','AVG SCROLL DEPTH'],
    ['sessions','SESSIONS'],['visitors','VISITORS'],
    ['conversionRate','SESSION CONVERSION'],['range','REPORTING RANGE']
  ];
  function mount(){
    if(typeof app==='undefined'||typeof user==='undefined'||user?.role!=='admin')return;
    if(document.getElementById('ip-behavior'))return;
    addStyle();
    const panel=document.createElement('section');
    panel.className='ip-behavior';panel.id='ip-behavior';
    panel.setAttribute('aria-label','Phân tích hành vi người dùng');
    panel.innerHTML='<div class="ip-behavior-top"><div><div class="ip-behavior-kicker">ADMIN · BEHAVIOR ANALYTICS</div>'+
      '<h2>USER BEHAVIOR</h2><p class="ip-behavior-sub">First-party anonymous analytics · Không lưu email, tên, số điện thoại hay nội dung tin nhắn.</p></div>'+
      '<div class="ip-behavior-filters" role="group" aria-label="Chọn khoảng thống kê">'+
      [7,30,90].map(n=>'<button type="button" class="ip-behavior-filter" data-days="'+n+'" aria-pressed="'+(n===selectedDays)+'">'+n+' NGÀY</button>').join('')+
      '<button type="button" class="ip-behavior-refresh" aria-label="Tải lại thống kê">↻</button></div></div>'+
      '<div class="ip-behavior-grid">'+items.map(([key,label])=>'<div class="ip-behavior-metric"><div class="ip-behavior-number" data-value="'+key+'">—</div><div class="ip-behavior-label">'+label+'</div></div>').join('')+'</div>'+
      '<p class="ip-behavior-status" role="status" aria-live="polite">Đang tải dữ liệu thực tế…</p>'+
      '<div class="ip-behavior-summary"><h3>Lượt truy cập theo ngày</h3><div class="ip-behavior-chart" role="img" aria-label="Biểu đồ số phiên truy cập theo ngày"></div>'+
      '<p class="ip-behavior-hint">Bounce: phiên một trang, dưới 10 giây hoạt động và không tương tác. Thời lượng chỉ tính lúc tab đang được sử dụng. Chuyển đổi chỉ tính khi backend tạo đơn thành công.</p></div>';
    app.appendChild(panel);
    panel.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>{
      selectedDays=Number(button.dataset.days);
      panel.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===selectedDays)));
      load(panel);
    }));
    panel.querySelector('.ip-behavior-refresh').addEventListener('click',()=>load(panel));
    load(panel);
  }
  function duration(seconds){
    const s=Math.max(0,Math.round(seconds||0));return s>=60?Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s':s+'s';
  }
  function number(value,digits=0){return Number(value||0).toLocaleString('vi-VN',{minimumFractionDigits:digits,maximumFractionDigits:digits})}
  async function load(panel){
    const id=++requestId,days=selectedDays;
    const status=panel.querySelector('.ip-behavior-status');
    status.textContent='Đang tải dữ liệu '+days+' ngày…';
    try{
      const r=await fetch('/api/admin/behavior?days='+days,{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw Error(r.status===403?'Bạn cần đăng nhập bằng tài khoản quản trị.':'Không thể lấy số liệu từ máy chủ ('+r.status+').');
      const data=await r.json();
      if(id!==requestId||!panel.isConnected)return;
      const k=data.kpis,values={
        bounceRate:number(k.bounceRate,1)+'%',avgSessionSeconds:duration(k.avgSessionSeconds),
        pagesPerSession:number(k.pagesPerSession,2),avgScrollDepth:number(k.avgScrollDepth,1)+'%',
        sessions:number(k.sessions),visitors:number(k.visitors),
        conversionRate:number(k.conversionRate,1)+'%',range:days+'d'
      };
      for(const [key,value]of Object.entries(values))panel.querySelector('[data-value="'+key+'"]').textContent=value;
      const chart=panel.querySelector('.ip-behavior-chart');
      chart.replaceChildren();
      const byDate=new Map((data.daily||[]).map(v=>[v.day,Number(v.sessions)]));
      const entries=[];
      const today=new Date();
      for(let i=days-1;i>=0;i--){
        const d=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate())-i*DAY);
        const name=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
        entries.push({name,count:byDate.get(name)||0});
      }
      const largest=Math.max(1,...entries.map(v=>v.count));
      for(const item of entries){
        const bar=document.createElement('div');bar.className='ip-behavior-bar';
        bar.style.height=(item.count?Math.max(5,item.count/largest*100):0)+'%';
        bar.title=item.name+': '+item.count+' phiên';chart.appendChild(bar);
      }
      chart.setAttribute('aria-label','Phiên truy cập mỗi ngày, tổng cộng '+k.sessions+' phiên trong '+days+' ngày');
      const from=new Date(data.range.from).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
      const to=new Date(data.range.to).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
      status.textContent='Dữ liệu '+from+' – '+to+' · '+number(k.conversions)+' phiên có đơn hàng · Không có dữ liệu lịch sử trước ngày bật đo lường.';
    }catch(e){if(id===requestId&&panel.isConnected)status.textContent=e.message}
  }
  if(typeof admin==='function'){
    const original=admin;
    admin=function(){const result=original.apply(this,arguments);mount();return result};
  }
  setTimeout(openSession,0);
})();
