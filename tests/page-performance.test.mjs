import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizePage} from '../scripts/optimize-page.mjs';

const marker=`const v4BaseInit=init;init=async function(){await Promise.all([loadMocks(),...FONT_NAMES.map(f=>document.fonts.load('32px "'+f+'"')),document.fonts.load('italic 32px "Lora"'),document.fonts.load('bold 32px "Lora"')]);`;
const boot="init().catch(e=>{console.error(e);showImprintError('service')});";
const mockLoader=`let mockImages={},mockPromise=null;
function loadMocks(){if(mockPromise)return mockPromise;mockPromise=Promise.all(Object.entries(MOCKUPS).map(([k,v])=>new Promise(resolve=>{let im=new Image();im.onload=()=>{mockImages[k]=im;resolve()};im.onerror=resolve;im.src=v.src})));return mockPromise}`;
function fixture(){
  return '<!doctype html><html><head><style>@font-face{font-family:"Lora";font-display:block}</style></head><body>'+
    '<main><div id="product-layout">Unchanged product design</div></main><script>'+mockLoader+
    'const HERO_IMAGE="/static/'+'a'.repeat(64)+'.webp";'+
    'const image=\'<img src="${HERO_IMAGE}" alt="ImPrint">\';'+
    marker+'await v4BaseInit();};'+boot+'</script></body></html>';
}

test('keeps HTML/design intact while unblocking first paint',()=>{
  const result=optimizePage(fixture());
  assert.match(result.html,/id="product-layout">Unchanged product design/);
  assert.match(result.html,/font-display:swap/);
  assert.doesNotMatch(result.html,/font-display:block/);
  assert.doesNotMatch(result.html,/await Promise\.all\(\[loadMocks/);
  assert.match(result.html,/const performanceStudio=studio/);
  assert.match(result.html,/mockRequests=new Map/);
  assert.match(result.html,/Promise\.all\(\[/);
  assert.match(result.html,/rel="preload" as="image"/);
  assert.match(result.html,/fetchpriority="high"/);
  assert.equal(result.script,null);
});

test('extracts JavaScript to immutable file and defers script execution',()=>{
  const result=optimizePage(fixture(),{externalizeScript:true});
  assert.match(result.script.path,/^\/static\/imprint-app-[0-9a-f]{24}\.js$/);
  assert.match(result.html,/script src="\/static\/imprint-app-/);
  assert.match(result.html,/defer><\/script>/);
  assert.doesNotMatch(result.html,/<script>const HERO_IMAGE/);
  assert.match(result.script.source,/const performanceStudio=studio/);
  assert.equal(optimizePage(fixture(),{externalizeScript:true}).script.path,result.script.path);
});

test('fails safely if source startup contract changes',()=>{
  assert.throws(()=>optimizePage('<html></html>'),/startup contract changed/);
});

test('prefers the actual above-the-fold mockup over the collection poster',()=>{
  const hero='/static/'+'b'.repeat(64)+'.webp';
  const sample=fixture().replace('const HERO_IMAGE=',`const MOCKUPS={"f_M":{"src":"${hero}"}};const HERO_IMAGE=`);
  const result=optimizePage(sample);
  assert.match(result.html,new RegExp('rel="preload" as="image" href="'+hero));
  assert.equal((result.html.match(/rel="preload" as="image"/g)||[]).length,1);
});

test('defers only collection media and preserves unrelated product imagery',()=>{
  const sample=fixture().replace(marker,
    `const collectionMediaString='<img src="${'${esc(c.src)}'}" alt="${'${esc(c.title)}'}" loading="lazy"><source src="${'${esc(c.src)}'}"></video>';`+marker);
  const result=optimizePage(sample);
  assert.match(result.html,/data-imprint-src/);
  assert.match(result.html,/Only collection media is deferred/);
  assert.match(result.html,/id="product-layout">Unchanged product design/);
});

test('avoids a synchronous carousel layout read without changing its sizing math',()=>{
  const carousel='function fit(){const width=scene.clientWidth;const ratio=Math.max(.6,1/(2*Math.tan(Math.PI/n)));const cw=Math.min(210,(width*.8)/(2*ratio+1));}const observer=new ResizeObserver(fit);observer.observe(scene);fit();cleanup=()=>observer.disconnect();';
  const result=optimizePage(fixture().replace(marker,carousel+marker));
  assert.doesNotMatch(result.html,/scene\.clientWidth/);
  assert.match(result.html,/entries\[0\]\?\.contentRect\.width/);
  assert.match(result.html,/const cw=Math\.min\(210,\(width\*\.8\)/);
  assert.doesNotMatch(result.html,/observer\.observe\(scene\);fit\(\)/);
});
