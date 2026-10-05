// IMPRINT_SEO_HISTORY_FIX_V1
// IMPRINT_SEO_CLIENT_V1
(()=>{
 const clean=hash=>{if(hash==='#home'||hash==='#')return '/';if(hash==='#shop')return '/san-pham';if(/^#product\/[\w-]+$/.test(hash))return '/san-pham/'+encodeURIComponent(hash.slice(9));return null};
 const legacy=clean(location.hash);if(legacy){location.replace(legacy+location.search);return}
 const originalRoute=route;window.removeEventListener('hashchange',originalRoute);
 route=function(){const target=clean(location.hash);if(target){location.assign(target);return}const state=window.IMPRINT_SEO,real=location.pathname+location.search+location.hash;
 if(!location.hash&&state){window.history.replaceState(null,'',location.pathname+location.search+'#'+state.route);try{originalRoute();if(state.category){const select=document.querySelector('#category');if(select){select.value=state.category;filterProducts()}}const categorySelect=document.querySelector('#category');if(categorySelect)categorySelect.onchange=()=>{const value=categorySelect.value;const slug=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');location.assign(value==='Tất cả'?'/san-pham':'/danh-muc/'+slug)};}finally{window.history.replaceState(null,'',real);document.title=state.title}}
 else {originalRoute();document.querySelector('script[type="application/ld+json"]')?.remove();let tag=document.querySelector('meta[name="robots"]');if(!tag){tag=document.createElement('meta');tag.name='robots';document.head.append(tag)}tag.content='noindex';}
 };
 window.addEventListener('hashchange',route);
 const originalGo=go;go=function(x){const dest=clean('#'+x);if(dest){location.assign(dest);return}if(location.pathname!=='/'){location.assign('/#'+x);return}originalGo(x)};
 function links(){document.querySelectorAll('a[href^="#"]').forEach(a=>{const href=a.getAttribute('href'),dest=clean(href);if(dest&&!a.hasAttribute('onclick'))a.setAttribute('href',dest);else if(!dest&&/^#(studio|cart|checkout|account|admin|help|feedback)(\/|$)/.test(href))a.setAttribute('href','/'+href)})}
 new MutationObserver(links).observe(document.getElementById('app'),{childList:true,subtree:true});links();
 // Keep server content visible until the API-backed UI is ready.
 const start=init;init=async function(){const content=app.innerHTML;const pending=start();if(document.getElementById('seo-content')===null&&content.includes('id="seo-content"'))app.innerHTML=content;await pending;links()};
})();
