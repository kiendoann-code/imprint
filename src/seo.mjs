export const origin='https://imprint.io.vn';
export const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const slug=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const productURL=p=>'/san-pham/'+encodeURIComponent(p.id);
const categoryURL=c=>'/danh-muc/'+slug(c);
const price=p=>Math.round(p.price*(1-(p.sale||0)/100));
const money=p=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(price(p));
const imageURL=p=>{try{const u=new URL(p.img,origin);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
const json=v=>JSON.stringify(v).replace(/</g,'\\u003c');
export function renderSEO(req,template,products){
 const u=new URL(req.url),path=u.pathname,cats=[...new Set(products.map(p=>p.cat).filter(Boolean))];
 const response=(body,status=200,type='text/html; charset=utf-8')=>new Response(req.method==='HEAD'?null:body,{status,headers:{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!['GET','HEAD'].includes(req.method))return response('Method not allowed',405,'text/plain');
 if(path==='/robots.txt')return response(`User-agent: *\nAllow: /\nDisallow: /api/admin/\nDisallow: /api/auth/\nSitemap: ${origin}/sitemap.xml\n`,200,'text/plain; charset=utf-8');
 if(path==='/sitemap.xml'){const urls=['/','/san-pham',...cats.map(categoryURL),...products.map(productURL)];return response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(p=>'<url><loc>'+escape(origin+p)+'</loc></url>').join('')+'</urlset>',200,'application/xml; charset=utf-8')}
 if(path==='/index.html'||path.length>1&&path.endsWith('/'))return new Response(null,{status:301,headers:{Location:(path==='/index.html'?'/':path.replace(/\/+$/,''))+u.search}});
 let p,cat;try{if(path.startsWith('/san-pham/'))p=products.find(p=>productURL(p)===path);if(path.startsWith('/danh-muc/'))cat=cats.find(c=>categoryURL(c)===path)}catch{}
 const valid=path==='/'||path==='/san-pham'||p||cat;
 if(!valid)return response('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="robots" content="noindex"><title>404 · ImPrint</title><h1>Không tìm thấy trang</h1><a href="/">Về trang chủ</a></html>',404);
 const title=p?`${p.name} | ImPrint Studio`:cat?`${cat} – Thiết kế theo ý bạn | ImPrint Studio`:path==='/san-pham'?'Sản phẩm – Áo tùy chỉnh | ImPrint Studio':'ImPrint Studio – In điều bạn thích, mặc theo cách của bạn';
 const description=(p?p.description:cat?`Khám phá ${cat} tại ImPrint Studio. Xem mẫu áo, giá, màu sắc và kích cỡ, lựa chọn thiết kế của riêng bạn.`:'Khám phá áo thun, hoodie và sweater tại ImPrint Studio. Chọn màu, kích cỡ và tùy chỉnh hình in theo phong cách của bạn.').slice(0,165);
 const crumbs=[{name:'Trang chủ',item:origin+'/'}];if(path!=='/')crumbs.push({name:'Sản phẩm',item:origin+'/san-pham'});if(cat||p?.cat)crumbs.push({name:cat||p.cat,item:origin+categoryURL(cat||p.cat)});if(p)crumbs.push({name:p.name,item:origin+productURL(p)});
 const graph=[{'@type':'BreadcrumbList',itemListElement:crumbs.map((c,i)=>({'@type':'ListItem',position:i+1,...c}))}];
 if(p)graph.push({'@type':'Product',name:p.name,description:p.description,sku:p.id,brand:{'@type':'Brand',name:'ImPrint Studio'},...(imageURL(p)?{image:[imageURL(p)]}:{}),offers:{'@type':'Offer',url:origin+productURL(p),priceCurrency:'VND',price:price(p),availability:'https://schema.org/'+(p.stock>0?'InStock':'OutOfStock'),itemCondition:'https://schema.org/NewCondition'}});
 const nav='<nav aria-label="Danh mục">'+cats.map(c=>`<a href="${categoryURL(c)}">${escape(c)}</a>`).join(' · ')+'</nav>';
 const cards=list=>'<div class="grid">'+list.map(x=>`<article><a href="${productURL(x)}"><img src="${escape(imageURL(x))}" alt="${escape(x.name)}" width="360" height="450" style="object-fit:contain"><h2>${escape(x.name)}</h2></a><p>${escape(money(x))}</p></article>`).join('')+'</div>';
 const body=`<div class="wrap section" id="seo-content"><nav aria-label="Đường dẫn">${crumbs.map(c=>`<a href="${escape(c.item)}">${escape(c.name)}</a>`).join(' / ')}</nav>${p?`<h1>${escape(p.name)}</h1><img src="${escape(imageURL(p))}" alt="${escape(p.name)}" width="480" height="600" style="object-fit:contain;max-width:100%"><p>${escape(p.description)}</p><p><strong>${escape(money(p))}</strong> · ${p.stock>0?'Còn hàng':'Hết hàng'}</p><p>Kích cỡ: ${escape((p.sizes||[]).join(', '))}</p><p>Màu sắc: ${escape((p.colors||[]).join(', '))}</p><ul>${(p.details||[]).map(d=>'<li>'+escape(d)+'</li>').join('')}</ul>`:`<h1>${escape(cat|| (path==='/'?'ImPrint Studio – In điều bạn thích':'Sản phẩm ImPrint'))}</h1><p>${escape(description)}</p>${nav}${cards(cat?products.filter(x=>x.cat===cat):products)}`}</div>`;
 const state={title,route:p?'product/'+p.id:path==='/'?'home':'shop',category:cat||null};
 const head=`<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(origin+path)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(origin+path)}"><script type="application/ld+json">${json({'@context':'https://schema.org','@graph':graph})}</script><script>window.IMPRINT_SEO=${json(state)}</script>`;
 const output=template.replace(/<title>[\s\S]*?<\/title>/i,'').replace('</head>',()=>head+'</head>').replace(/<main id="app">[\s\S]*?<\/main>/,()=>'<main id="app">'+body+'</main>');
 return response(output);
}
