import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizePage} from '../scripts/optimize-page.mjs';

const marker=`const v4BaseInit=init;init=async function(){await Promise.all([loadMocks(),...FONT_NAMES.map(f=>document.fonts.load('32px "'+f+'"')),document.fonts.load('italic 32px "Lora"'),document.fonts.load('bold 32px "Lora"')]);`;
const boot="init().catch(e=>{console.error(e);showImprintError('service')});";
function fixture(){
  return '<!doctype html><html><head><style>@font-face{font-family:"Lora";font-display:block}</style></head><body>'+
    '<main><div id="product-layout">Unchanged product design</div></main><script>'+
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
  assert.match(result.html,/loadMocks\(\)\.then/);
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
