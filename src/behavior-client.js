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
      '.ip-behavior-bar.is-historical{background:#567a70}',
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
    ['mergedPageViews','Lượt xem trang','Đã gộp CSV + đo trực tiếp theo ngày'],
    ['mergedDailyVisitors','Tổng khách theo từng ngày','Có thể trùng khách giữa các ngày'],
    ['sessions','Phiên truy cập','Nhật ký khôi phục + đo trực tiếp không trùng ngày'],
    ['visitors','Khách riêng biệt','Dựa trên mã khách của nhật ký + đo trực tiếp'],
    ['pageViewsPerSession','Trang / phiên','Đo từ ngày bật'],
    ['avgSessionSeconds','Thời gian hoạt động','Đo từ ngày bật'],
    ['bounceRate','Tỷ lệ thoát','Đo từ ngày bật'],
    ['avgScrollDepth','Độ sâu cuộn trang','Đo từ ngày bật'],
    ['addToCart','Lượt thêm vào giỏ','Đo từ ngày bật'],
    ['conversionRate','Chuyển đổi / phiên','Đo từ ngày bật'],
    ['orders','Đơn đã đặt','Đồng bộ Thống kê kinh doanh'],
    ['buyers','Hồ sơ khách đặt hàng','Có cả hồ sơ nguồn khôi phục; không phải tài khoản đã xác minh']
  ];
  function mount(){
    if(typeof app==='undefined'||typeof user==='undefined'||user?.role!=='admin')return;
    if(document.getElementById('ip-behavior'))return;
    addStyle();
    const section=document.createElement('section');section.id='ip-behavior';section.className='ip-behavior';
    section.setAttribute('aria-label','Phân tích hành vi người dùng ImPrint');
    section.innerHTML='<div class="ip-behavior-top"><div><div class="ip-behavior-kicker">IMPRINT / QUẢN TRỊ / BÁO CÁO</div>'+
      '<h2>Hành vi khách truy cập</h2>'+
      '<p class="ip-behavior-sub">Lưu lượng lịch sử và hoạt động trực tiếp được ghép theo ngày. Nhật ký phiên khôi phục cho phép tính khách riêng biệt toàn kỳ. Nếu cùng một ngày có hai nguồn, chỉ sử dụng một nguồn cho số phiên và các chỉ số phiên. Đơn hàng và hồ sơ khách sử dụng cùng số liệu với Thống kê kinh doanh.</p></div>'+
      '<div class="ip-behavior-filters" role="group" aria-label="Chọn khoảng thời gian">'+
      [7,30,90].map(d=>'<button type="button" class="ip-behavior-filter" data-days="'+d+'" aria-pressed="'+(selectedDays===d)+'">'+d+' ngày</button>').join('')+
      '<button type="button" class="ip-behavior-refresh" aria-label="Làm mới báo cáo" title="Làm mới">↻</button></div></div>'+
      '<div class="ip-behavior-grid">'+metrics.map(([key,label,tag])=>'<div class="ip-behavior-metric"><div class="ip-behavior-number" data-value="'+key+'">—</div>'+
        '<div class="ip-behavior-label">'+label+'</div><span class="ip-behavior-tag">'+tag+'</span></div>').join('')+'</div>'+
      '<p class="ip-behavior-status" role="status" aria-live="polite">Đang lấy dữ liệu…</p>'+
      '<div class="ip-behavior-charts">'+
       '<div class="ip-behavior-chart-card"><h3>Lượt xem trang theo ngày · đã gộp</h3><p class="ip-behavior-hint">Màu xanh: CSV lịch sử; màu nâu: đo trực tiếp. Trùng ngày chọn CSV, không cộng đôi.</p><div class="ip-behavior-chart" data-chart="mergedPageViews" role="img"></div></div>'+
       '<div class="ip-behavior-chart-card"><h3>Khách truy cập theo ngày · đã gộp</h3><p class="ip-behavior-hint">Lượt khách riêng biệt từng ngày có thể trùng nhau giữa các ngày; không phải khách riêng biệt toàn kỳ.</p><div class="ip-behavior-chart" data-chart="mergedDailyVisitors" role="img"></div></div>'+
       '<div class="ip-behavior-chart-card"><h3>Phiên truy cập theo ngày</h3><p class="ip-behavior-hint">Dữ liệu đo lường trực tiếp, không ước tính lịch sử</p><div class="ip-behavior-chart" data-chart="sessions" role="img"></div></div>'+
       '<div class="ip-behavior-chart-card"><h3>Đơn hàng theo ngày</h3><p class="ip-behavior-hint">Đơn hoạt động + lịch sử khôi phục; cùng cách tính với Thống kê kinh doanh</p><div class="ip-behavior-chart" data-chart="orders" role="img"></div></div></div>'+
      '<div class="ip-behavior-external" hidden style="display:none"><div class="ip-behavior-external-head"><div><strong>Lịch sử Cloudflare Analytics</strong>'+
       '<p>Nhập CSV Cloudflare theo ngày hoặc CSV nhật ký phiên (849 dòng / 511 mã khách). Hệ thống tự nhận diện loại file và đưa vào biểu đồ, không cộng trùng cùng ngày.</p></div>'+
       '<button type="button" class="ip-behavior-import">Nhập CSV lịch sử</button><input type="file" hidden accept=".csv,text/csv" class="ip-behavior-file"></div>'+
      '<div class="ip-behavior-mini"><span>Ngày đã nhập: <b data-historical="days">—</b></span>'+
        '<span>Tổng lượt xem trang/ngày: <b data-historical="views">—</b></span>'+
        '<span>Tổng khách duy nhất theo ngày: <b data-historical="visitors">—</b></span></div>'+
      '<p class="ip-behavior-hint">CSV gồm cột date, visitors, pageViews (mỗi dòng một ngày). Chỉ số khách duy nhất theo ngày không phải số khách riêng biệt của cả kỳ.</p></div>'+
      '<div class="ip-behavior-external"><div class="ip-behavior-external-head"><div><strong>Khôi phục nhật ký phiên truy cập</strong>'+
        '<p>Nhập CSV chứa mã khách và mã phiên để khôi phục chính xác số khách riêng biệt trong giai đoạn lịch sử. Không ghi đè phiên đang đo trực tiếp.</p></div>'+
        '<button type="button" class="ip-behavior-import ip-behavior-session-import">Nhập CSV phiên</button>'+
        '<input type="file" hidden accept=".csv,text/csv" class="ip-behavior-session-file"></div>'+
        '<div class="ip-behavior-mini" hidden style="display:none"><span>Phiên khôi phục: <b data-recovered="sessions">—</b></span>'+
        '<span>Khách riêng biệt khôi phục: <b data-recovered="visitors">—</b></span></div>'+
        '<p class="ip-behavior-hint">Chỉ hỗ trợ nhật ký có nguồn rõ ràng. Mã khách giữa hệ thống lịch sử và hệ thống đo mới có thể không liên kết được; số khách riêng biệt khi trộn hai giai đoạn có thể trùng. Đơn hàng và thanh toán vẫn tách biệt.</p></div>';
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
        const csv=await file.text();
        const isSessions=isSessionHistoryCSV(csv);
        if(file.size>(isSessions?120000:16000)){
          throw Error(isSessions?'CSV phiên quá lớn: tối đa 120 KB.':'CSV Cloudflare quá lớn: tối đa 16 KB.');
        }
        const rows=isSessions?parseSessionsCSV(csv):parseHistoryCSV(csv);
        const response=await fetch(isSessions?'/api/admin/behavior/import-sessions':'/api/admin/behavior/import-history',{
          method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({source:isSessions?'imprint-workbook':'cloudflare',rows})
        });
        let json;
        try{json=await response.json()}catch{throw Error('Máy chủ trả về dữ liệu không hợp lệ (HTTP '+response.status+').')}
        if(!response.ok)throw Error(json.error||'Không nhập được dữ liệu (HTTP '+response.status+').');
        await load(section);
        section.querySelector('.ip-behavior-status').textContent=isSessions
          ?'Đã nhập nhật ký phiên thành công và cập nhật các chỉ số Analytics.'
          :'Đã cập nhật dữ liệu Analytics từ CSV.';
      }catch(e){section.querySelector('.ip-behavior-status').textContent=e.message}
      finally{pick.disabled=false;input.value=''}
    });
    const sessionButton=section.querySelector('.ip-behavior-session-import');
    const sessionFile=section.querySelector('.ip-behavior-session-file');
    sessionButton.addEventListener('click',()=>sessionFile.click());
    sessionFile.addEventListener('change',async()=>{
      const file=sessionFile.files?.[0];if(!file)return;
      sessionButton.disabled=true;
      try{
        if(file.size>120000)throw Error('CSV nhật ký quá lớn: tối đa 120 KB.');
        const rows=parseSessionsCSV(await file.text());
        const response=await fetch('/api/admin/behavior/import-sessions',{
          method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({source:'imprint-workbook',rows})
        });
        const json=await response.json();
        if(!response.ok)throw Error(json.error||'Không nhập được nhật ký phiên.');
        await load(section);
        section.querySelector('.ip-behavior-status').textContent='Đã nhập nhật ký phiên thành công và cập nhật các chỉ số Analytics.';
      }catch(e){section.querySelector('.ip-behavior-status').textContent=e.message}
      finally{sessionButton.disabled=false;sessionFile.value=''}
    });
    load(section);
  }
  function isSessionHistoryCSV(csv){
    const first=csv.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0];
    const headers=first.toLowerCase().split(',').map(x=>x.trim().replace(/["']/g,''));
    return headers.includes('session_id')&&headers.includes('visitor_id');
  }
  function parseSessionsCSV(csv){
    const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
    if(lines.length<2||lines.length>2001)throw Error('CSV cần có 1–2.000 dòng phiên truy cập.');
    const cols=lines[0].split(',').map(v=>v.trim().toLowerCase());
    const required=['date','session_id','visitor_id','page_views','engagement_seconds',
      'bounced','scroll_depth_pct','add_to_cart','converted'];
    if(required.some(k=>!cols.includes(k)))throw Error('CSV phiên thiếu cột bắt buộc. Cần date, session_id, visitor_id và các chỉ số phiên.');
    const at=(cells,key)=>cells[cols.indexOf(key)];
    const number=(cells,key)=>{const n=Number(at(cells,key));if(!Number.isFinite(n))throw Error('Giá trị không phải số: '+key);return n};
    return lines.slice(1).map(line=>{
      const cells=line.split(',');
      if(cells.length!==cols.length)throw Error('Một dòng CSV có số cột không hợp lệ.');
      return {day:at(cells,'date'),sessionId:at(cells,'session_id'),
        visitorId:at(cells,'visitor_id'),pageViews:number(cells,'page_views'),
        engagementSeconds:number(cells,'engagement_seconds'),bounced:number(cells,'bounced'),
        scrollDepth:number(cells,'scroll_depth_pct'),addToCart:number(cells,'add_to_cart'),
        converted:number(cells,'converted')};
    });
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
    const map=new Map((source||[]).map(item=>[item.day,item]));
    const current=new Date(Date.now()+7*3600000);
    const midnight=Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate());
    const values=[];
    for(let i=days-1;i>=0;i--){const day=new Date(midnight-i*DAY).toISOString().slice(0,10);const item=map.get(day);values.push({day,value:Number(item?.[key])||0,imported:!!item?.[key==='pageViews'?'importedPageViews':'importedVisitors']})}
    const ceiling=Math.max(1,...values.map(v=>v.value));
    for(const entry of values){
      const bar=document.createElement('div');bar.className='ip-behavior-bar '+klass+(entry.imported?' is-historical':'');
      bar.style.height=(entry.value?Math.max(4,entry.value/ceiling*100):0)+'%';
      bar.title=entry.day+': '+fmt(entry.value)+(entry.imported?' · CSV lịch sử':' · đo trực tiếp');el.appendChild(bar);
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
      const k=data.combinedKpis||data.kpis,history=data.historicalOrders,external=data.importedAnalytics,merged=data.mergedAnalytics,recovered=data.recoveredSessions;
      const values={
        mergedPageViews:fmt(merged.pageViews),mergedDailyVisitors:fmt(merged.dailyVisitors),
        sessions:fmt(k.sessions),visitors:fmt(k.visitors),
        pageViewsPerSession:fmt(k.pagesPerSession,2),avgSessionSeconds:duration(k.avgSessionSeconds),
        bounceRate:fmt(k.bounceRate,1)+'%',avgScrollDepth:fmt(k.avgScrollDepth,1)+'%',
        addToCart:fmt(k.addToCart),conversionRate:fmt(k.conversionRate,1)+'%',
        orders:fmt(history.orders),buyers:fmt(history.buyers)
      };
      for(const [key,value]of Object.entries(values))section.querySelector('[data-value="'+key+'"]').textContent=value;
      drawChart(section.querySelector('[data-chart="mergedPageViews"]'),merged.daily,'pageViews',days);
      drawChart(section.querySelector('[data-chart="mergedDailyVisitors"]'),merged.daily,'visitors',days);
      drawChart(section.querySelector('[data-chart="sessions"]'),data.mergedSessionsDaily||data.daily,'sessions',days);
      drawChart(section.querySelector('[data-chart="orders"]'),history.daily,'orders',days,'is-order');
      section.querySelector('[data-historical="days"]').textContent=fmt(external.importedDays);
      section.querySelector('[data-historical="views"]').textContent=external.importedDays?fmt(external.pageViews):'Chưa có dữ liệu';
      section.querySelector('[data-historical="visitors"]').textContent=external.importedDays?fmt(external.dailyVisitors):'Chưa có dữ liệu';
      section.querySelector('[data-recovered="sessions"]').textContent=recovered?.available?fmt(recovered.sessions):'Chưa nhập';
      section.querySelector('[data-recovered="visitors"]').textContent=recovered?.available?fmt(recovered.visitors):'Chưa nhập';
      const salesPeriod='Đơn hàng '+history.range.from+'–'+history.range.to+' theo ngày đặt · '+history.recoveredOrders+' đơn lịch sử được gộp; đồng bộ với Thống kê kinh doanh khi chọn cùng ngày. ';
      status.textContent=salesPeriod+(recovered?.available
        ?'Báo cáo '+days+' ngày · Các chỉ số lưu lượng đã được tổng hợp từ dữ liệu hiện có. '+(k.sourceMixed?'Dữ liệu từ hai hệ đo có thể chứa khách trùng chưa đối chiếu.':'')+' Đơn hàng lấy từ D1.'
        :'Báo cáo '+days+' ngày · Chỉ số khách riêng biệt tính từ dữ liệu đo hiện có.');
    }catch(e){if(requestId===id&&section.isConnected)status.textContent=e.message}
  }
  if(typeof admin==='function'){
    const original=admin;
    admin=function(){const result=original.apply(this,arguments);mount();return result};
  }
  setTimeout(openSession,0);
})();
