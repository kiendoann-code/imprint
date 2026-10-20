// Build-time performance transformations only. Keep the original authored HTML,
// apparel imagery and layout untouched, while removing startup-only resource waits.
import crypto from 'node:crypto';

const blockingInit=`const v4BaseInit=init;init=async function(){await Promise.all([loadMocks(),...FONT_NAMES.map(f=>document.fonts.load('32px "'+f+'"')),document.fonts.load('italic 32px "Lora"'),document.fonts.load('bold 32px "Lora"')]);`;
const fastInit='const v4BaseInit=init;init=async function(){';
const eagerMocks=`let mockImages={},mockPromise=null;
function loadMocks(){if(mockPromise)return mockPromise;mockPromise=Promise.all(Object.entries(MOCKUPS).map(([k,v])=>new Promise(resolve=>{let im=new Image();im.onload=()=>{mockImages[k]=im;resolve()};im.onerror=resolve;im.src=v.src})));return mockPromise}`;
const selectiveMocks=`let mockImages={},mockRequests=new Map();
function loadMocks(){
  const keys=new Set(['f_M']);
  if(draft?.model){
    keys.add(draft.model+'_M');
    keys.add(draft.model+'_'+(draft.size||'M'));
  }
  if(typeof chosen!=='undefined'&&chosen?.model){
    keys.add(chosen.model+'_M');
    keys.add(chosen.model+'_'+(chosen.size||'M'));
  }
  const pending=[...keys].filter(key=>MOCKUPS[key]).map(key=>{
    if(mockImages[key])return Promise.resolve();
    if(!mockRequests.has(key)){
      mockRequests.set(key,new Promise(resolve=>{
        const im=new Image();
        im.onload=()=>{mockImages[key]=im;resolve()};
        im.onerror=()=>resolve();
        im.src=MOCKUPS[key].src;
      }));
    }
    return mockRequests.get(key);
  });
  return Promise.all(pending);
}`;

const initialBoot="init().catch(e=>{console.error(e);showImprintError('service')});";
const lazyCollectionMedia="\n// Only collection media is deferred. The hero, product details, order preview,\n// Studio artwork and image data stay on their existing direct-loading paths.\nconst deferredMedia=(function(){\n  if(typeof window==='undefined'||typeof document==='undefined')return;\n  const root=document.getElementById('app');\n  if(!root)return;\n  const load=target=>{\n    if(target.tagName==='IMG'){\n      const src=target.getAttribute('data-imprint-src');\n      if(src){target.removeAttribute('data-imprint-src');target.src=src}\n    }else if(target.tagName==='VIDEO'){\n      const sources=target.querySelectorAll('source[data-imprint-src]');\n      if(!sources.length)return;\n      for(const source of sources){\n        source.src=source.getAttribute('data-imprint-src');\n        source.removeAttribute('data-imprint-src');\n      }\n      target.load();\n      if(target.autoplay&&target.muted)target.play().catch(()=>{});\n    }\n  };\n  const seen=new WeakSet();\n  const io='IntersectionObserver'in window?new IntersectionObserver(entries=>{\n    for(const entry of entries){\n      if(!entry.isIntersecting)continue;\n      io.unobserve(entry.target);\n      load(entry.target);\n    }\n  },{rootMargin:'240px 0px',threshold:0}):null;\n  const attach=target=>{\n    if(seen.has(target))return;\n    seen.add(target);\n    if(io)io.observe(target);else load(target);\n  };\n  let scheduled=false;\n  const scan=()=>{\n    scheduled=false;\n    for(const img of root.querySelectorAll('img[data-imprint-src]'))attach(img);\n    for(const source of root.querySelectorAll('source[data-imprint-src]')){\n      const video=source.closest('video');\n      if(video)attach(video);\n    }\n  };\n  const schedule=()=>{\n    if(scheduled)return;\n    scheduled=true;\n    requestAnimationFrame(scan);\n  };\n  new MutationObserver(schedule).observe(root,{childList:true,subtree:true});\n  schedule();\n})();\n";
const lazyStudio=`// Defer Studio-only mockup decoding until the editor is actually opened.
const performanceStudio=studio;
studio=function(...args){
  const result=performanceStudio(...args);
  Promise.all([
    loadMocks(),
    ...FONT_NAMES.map(name=>document.fonts.load('32px "'+name+'"'))
  ]).then(()=>{
    if(location.hash.startsWith('#studio')&&document.getElementById('canvas')){
      try{draw()}catch(error){console.error('[ImPrint Studio mockups]',error)}
    }
  }).catch(error=>console.error('[ImPrint Studio assets]',error));
  return result;
};
`;

export function optimizePage(html,{externalizeScript=false}={}){
  if(!html.includes(blockingInit))throw Error('ImPrint startup contract changed; abort performance patch rather than silently altering behavior.');
  if(!html.includes(initialBoot))throw Error('ImPrint initialization contract changed; abort performance patch.');
  if(!html.includes(eagerMocks))throw Error('ImPrint mockup loading contract changed; abort unsafe optimization.');
  html=html.replace(eagerMocks,selectiveMocks);
  html=html.replace(blockingInit,fastInit);
  // Do not even assign network URLs to below-the-fold collection media until
  // it approaches the viewport. The existing collection layout is untouched.
  const collectionImage='<img src="${esc(c.src)}" alt="${esc(c.title)}" loading="lazy">';
  const collectionVideo='<source src="${esc(c.src)}"></video>';
  if(html.includes(collectionImage))html=html.replace(collectionImage,
    '<img data-imprint-src="${esc(c.src)}" alt="${esc(c.title)}" loading="lazy" decoding="async">');
  if(html.includes(collectionVideo))html=html.replace(collectionVideo,
    '<source data-imprint-src="${esc(c.src)}"></video>');
  html=html.replace(initialBoot,lazyStudio+lazyCollectionMedia+initialBoot);
  // The 3D collection carousel previously measured scene.clientWidth immediately
  // after DOM writes, forcing a synchronous layout. The ResizeObserver entry
  // contains the same width without another layout read; sizing math is unchanged.
  html=html.replace('function fit(){const width=scene.clientWidth;',
    'function fit(entries){const width=entries[0]?.contentRect.width;if(!width)return;');
  html=html.replace('const observer=new ResizeObserver(fit);observer.observe(scene);fit();cleanup=()=>observer.disconnect();',
    'const observer=new ResizeObserver(fit);observer.observe(scene);cleanup=()=>observer.disconnect();');
  // The existing 6 bundled display fonts are still available; do not hide text
  // while waiting for font downloads. Their eventual appearance is unchanged.
  html=html.replace(/font-display:block/g,'font-display:swap');
  // Hero is generated by the SPA script. Surface its existing, exact asset URL
  // to the browser before JS executes, without changing the visual composition.
  // Home's actual above-the-fold image is MOCKUPS.f_M (set by homeV4).
  // Avoid spending LCP preload bandwidth on the unrelated collection poster.
  const heroMock=html.match(/"f_M":\{"src":"(\/static\/[a-f0-9]+\.(?:webp|png|jpg))"/);
  const poster=html.match(/const HERO_IMAGE=["'](\/static\/[a-f0-9]+\.(?:webp|png|jpg))["']/);
  const primary=heroMock?.[1]||poster?.[1];
  if(primary)html=html.replace('</head>',`<link rel="preload" as="image" href="${primary}" fetchpriority="high"></head>`);
  html=html.replace('<div class="hero-art"><img src="${photo}" alt=',
    '<div class="hero-art"><img width="600" height="600" fetchpriority="high" decoding="async" src="${photo}" alt=');
  html=html.replace('<img src="${HERO_IMAGE}" alt=',
    '<img src="${HERO_IMAGE}" decoding="async" alt=');
  if(!externalizeScript)return{html,script:null};
  const begin=html.indexOf('<script>'),end=html.lastIndexOf('</script>');
  if(begin<0||end<=begin||html.indexOf('<script>',begin+8)!==-1)throw Error('Expected exactly one ImPrint inline app script.');
  const source=html.slice(begin+8,end);
  const digest=crypto.createHash('sha256').update(source).digest('hex').slice(0,24);
  const path='/static/imprint-app-'+digest+'.js';
  html=html.slice(0,begin)+html.slice(end+9);
  html=html.replace('</head>',`<script src="${path}" defer></script></head>`);
  return{html,script:{path,source}};
}
