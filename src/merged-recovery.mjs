// Combine recovered, user-attested sales records with existing live statistics.
// The source has no verified login user IDs, shipping details, or payment proof.
// Reporting is unified; write paths / authentication / stock remain unchanged.
import {readRecoveredRows} from './recovered-orders.mjs';
const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
const first=(db,sql,...args)=>query(db,sql,...args).first();
const all=async(db,sql,...args)=>(await query(db,sql,...args).all()).results;
const n=v=>Number(v)||0;
const sortDate=(a,b)=>n(b.placedAtMs)-n(a.placedAtMs)||String(b.id).localeCompare(String(a.id));

export function asRecoveredOrder(r){
  const items=JSON.parse(r.itemsJson);
  return {
    id:r.id, owner:r.customerEmail, date:r.placedAt, status:5,
    shipping:{fullName:'',phone:'',city:'',ward:'',address:'',note:''},
    items:items.map((i,j)=>({
      id:r.id+'-item-'+j,
      product:{id:'recovered:'+i.sku,name:i.name,img:'',price:i.unitPrice},
      color:i.color,size:'',qty:i.quantity,unit:i.unitPrice,preview:''
    })),
    sub:r.valueVnd, total:r.valueVnd, ship:null, discount:null,
    payment:'Chưa có chứng từ thanh toán', tracking:'', history:[],
    recovery:true, readOnly:true, recoveryBatch:r.batchId,
    customerName:r.customerName, historicalProductValue:r.valueVnd,
    recoveredAtSource:r.placedAt, placedAtMs:r.placedAtMs
  };
}

export async function getMergedBootstrapOrders(db){
  const live=await all(db,'SELECT body,created_at FROM orders ORDER BY created_at DESC,id DESC LIMIT 1000');
  const recovered=await readRecoveredRows(db);
  return [
    ...live.map(o=>({placedAtMs:o.created_at,body:JSON.parse(o.body)})),
    ...recovered.map(r=>({placedAtMs:r.placedAtMs,body:asRecoveredOrder(r)}))
  ].sort((a,b)=>n(b.placedAtMs)-n(a.placedAtMs)).slice(0,1000).map(x=>x.body);
}

export async function getMergedOrderPage(db,range,params){
  const q=String(params.get('q')||'').trim().slice(0,100);
  const st=params.get('status');
  let status=null;
  if(st!==null&&st!==''){
    status=Number(st);
    if(!Number.isInteger(status)||status<0||status>8){
      const e=new Error('Trạng thái chưa hợp lệ.');e.status=400;throw e;
    }
  }
  let where='created_at>=? AND created_at<?',args=[range.start,range.end];
  if(status!==null){where+=' AND status=?';args.push(status)}
  if(q){
    where+=" AND (instr(lower(id),lower(?))>0 OR instr(lower(COALESCE(json_extract(body,'$.owner'),'')),lower(?))>0 OR instr(lower(COALESCE(json_extract(body,'$.shipping.fullName'),'')),lower(?))>0 OR instr(COALESCE(json_extract(body,'$.shipping.phone'),''),?)>0)";
    args.push(q,q,q,q);
  }
  const requested=Number(params.get('page')||1);
  if(!Number.isInteger(requested)||requested<1||requested>10000){
    const e=new Error('Trang chưa hợp lệ.');e.status=400;throw e;
  }
  const liveTotal=n((await first(db,'SELECT COUNT(*) total FROM orders WHERE '+where,...args)).total);
  let recovered=status===null||status===5?await readRecoveredRows(db,range.start,range.end):[];
  if(q){
    const term=q.toLocaleLowerCase('vi-VN');
    recovered=recovered.filter(r=>[r.id,r.customerName,r.customerEmail].some(v=>String(v||'').toLocaleLowerCase('vi-VN').includes(term)));
  }
  const total=liveTotal+recovered.length,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(requested,pages);
  // The first page*20 live rows suffice to merge and paginate correctly
  // because recovered rows are all held in the small audited archive.
  const live=await all(db,'SELECT body,created_at FROM orders WHERE '+where+' ORDER BY created_at DESC,id DESC LIMIT ?',...args,page*20);
  const list=[
    ...live.map(v=>({placedAtMs:v.created_at,body:JSON.parse(v.body)})),
    ...recovered.map(v=>({placedAtMs:v.placedAtMs,body:asRecoveredOrder(v)}))
  ].sort((a,b)=>n(b.placedAtMs)-n(a.placedAtMs)||String(b.body.id).localeCompare(String(a.body.id)));
  return {orders:list.slice((page-1)*20,page*20).map(v=>v.body),total,page,pages,
    recoveredOrders:recovered.length,merged:true};
}

function increment(map,key,value,initial){const r=map.get(key)||initial();value(r);map.set(key,r)}
export async function mergeRecoveredAnalytics(db,base,start,end){
  const restored=await readRecoveredRows(db,start,end);
  const k=base.kpis;
  const byEmail=new Map();
  const daily=new Map(base.daily.map(d=>[d.day,{...d}]));
  const hourly=new Map(base.hourly.map(d=>[n(d.hour),{...d}]));
  const heatmap=new Map(base.heatmap.map(d=>[n(d.weekday)+':'+n(d.hour),{...d}]));
  const statuses=new Map(base.statuses.map(d=>[n(d.status),{...d}]));
  const products=new Map(base.products.map(d=>[String(d.id),{...d}]));
  let revenue=0;
  for(const r of restored){
    revenue+=n(r.valueVnd);
    increment(byEmail,r.customerEmail,e=>{
      e.count++;e.revenue+=n(r.valueVnd);
      if(r.placedAtMs<e.first)e.first=r.placedAtMs;
      if(r.placedAtMs>e.last)e.last=r.placedAtMs;
      e.name=r.customerName;
    },()=>({count:0,revenue:0,first:Infinity,last:0,name:r.customerName}));
    increment(daily,r.day,d=>{d.orders=n(d.orders)+1;d.revenue=n(d.revenue)+n(r.valueVnd);},()=>({day:r.day,orders:0,cancelled:0,returned:0,revenue:0}));
    const hour=Number(r.placedAt.slice(11,13));
    increment(hourly,hour,d=>{d.orders=n(d.orders)+1;},()=>({hour,orders:0}));
    const weekday=new Date(r.day+'T00:00:00Z').getUTCDay();
    increment(heatmap,weekday+':'+hour,d=>{d.orders=n(d.orders)+1;},()=>({weekday,hour,orders:0}));
    increment(statuses,5,d=>{d.orders=n(d.orders)+1;},()=>({status:5,orders:0}));
    for(const item of JSON.parse(r.itemsJson)){
      const id='recovered:'+item.sku;
      increment(products,id,d=>{
        d.quantity=n(d.quantity)+n(item.quantity);
        d.orders=n(d.orders)+1;
        d.gross=n(d.gross)+n(item.lineTotal);
      },()=>({id,name:item.name,quantity:0,orders:0,gross:0,recoveredSource:true}));
    }
  }
  k.orders=n(k.orders)+restored.length;
  k.delivered=n(k.delivered)+restored.length;
  k.deliveredRevenue=n(k.deliveredRevenue)+revenue;
  k.activeValue=n(k.activeValue)+revenue;
  // Source emails are non-routable placeholders; never merge them into actual
  // accounts or claim verified unique people. These are source customer records.
  k.buyers=n(k.buyers)+byEmail.size;
  k.deliveredBuyers=n(k.deliveredBuyers)+byEmail.size;
  k.repeatBuyers=n(k.repeatBuyers)+[...byEmail.values()].filter(v=>v.count>1).length;
  k.cancelRate=k.orders?n(k.cancelled)/k.orders*100:0;
  k.returnRate=k.orders?n(k.returned)/k.orders*100:0;
  k.averageDelivered=k.delivered?Math.round(k.deliveredRevenue/k.delivered):0;
  base.daily=[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day));
  base.hourly=[...hourly.values()].sort((a,b)=>a.hour-b.hour);
  base.heatmap=[...heatmap.values()].sort((a,b)=>a.weekday-b.weekday||a.hour-b.hour);
  base.statuses=[...statuses.values()].sort((a,b)=>a.status-b.status);
  base.products=[...products.values()].sort((a,b)=>b.quantity-a.quantity||b.gross-a.gross).slice(0,10);
  const historicalCustomers=[...byEmail.entries()].map(([email,v])=>({
    id:'recovered:'+email,name:v.name,email,orders:v.count,
    delivered:v.count,revenue:v.revenue,firstOrder:v.first,lastOrder:v.last,
    recoveredSource:true
  }));
  base.customers=[...base.customers,...historicalCustomers].sort((a,b)=>b.lastOrder-a.lastOrder).slice(0,30);
  base.recovery={orders:restored.length,revenueVnd:revenue,customerRecords:byEmail.size,
    mergedIntoTotals:true,source:'User-provided recovery, internally reconciled; payment and identities not independently verified'};
  base.definitions={
    ...base.definitions,
    revenue:'Giá trị hàng của tất cả đơn hiện Đã giao, gồm đơn vận hành và đơn lịch sử nhập, không gồm phí vận chuyển. Không đồng nghĩa tiền thực thu.',
    buyers:'Tổng định danh khách đặt hàng gồm tài khoản hiện tại và các hồ sơ email nguồn khôi phục; không phải số người mua đã xác minh.',
    products:'Số lượng mặt hàng đã giao gồm đơn hiện tại và đơn nhập lịch sử; SKU nguồn giữ nhãn riêng để tránh gộp nhầm.',
    archive:'Đơn lịch sử được cộng vào tổng đơn, đã giao, doanh thu, biểu đồ ngày/giờ, trạng thái, sản phẩm và khách hàng. Không tạo tài khoản đăng nhập hay thay đổi tồn kho.',
    shippingProfiles:'Chỉ tính địa chỉ người nhận trong đơn hiện tại; dữ liệu khôi phục không chứa thông tin vận chuyển.'
  };
  return base;
}
