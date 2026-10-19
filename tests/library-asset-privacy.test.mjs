import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/design-library-client.js',import.meta.url),'utf8');
const section=(start,end)=>source.split(start)[1]?.split(end)[0]||'';

test('customer Art / Icon / Vector tiles contain image only, without file names',()=>{
  assert.doesNotThrow(()=>new Function(source));
  const render=section('function renderPublic(panel,category)','async function insert(it)');
  assert.match(render,/tile\.append\(im\);/);
  assert.doesNotMatch(render,/tile\.title\s*=/);
  assert.doesNotMatch(render,/tile\.append\(im\s*,\s*element\('span'/);
  assert.match(render,/im\.alt\s*=\s*''/);
  assert.match(render,/aria-label','Thêm hình vào thiết kế'/);
});

test('legacy thumbnail captions and tooltips hidden without affecting category selectors',()=>{
  assert.match(source,/#assetGrid\.asset-grid > button > span/);
  assert.match(source,/display:none!important/);
  assert.match(source,/tile\.removeAttribute\('title'\)/);
  assert.match(source,/function mountStudio\(\)\{if\(!studioReady\(\)\)return;\s*hideCustomerAssetTitles\(\)/);
  assert.match(source,/if\(panel\.dataset\.libraryVersion!==version\)[^\n]*\n\s*hideCustomerAssetTitles\(\)/);
  assert.match(source,/const CAT=\['Tất cả','Icon','Art','Vector'\]/);
});

test('customer messages and transferred artwork do not leak internal asset name',()=>{
  const insert=section('async function insert(it)','// Legacy app renders');
  assert.doesNotMatch(insert,/it\.name/);
  assert.match(insert,/ImPrint-Artwork\./);
  assert.match(insert,/Đã chuyển hình từ thư viện vào công cụ Ảnh/);
});

test('internal admin labels and font control remain intact',()=>{
  assert.match(source,/element\('strong','',it\.name\)/);
  assert.match(source,/it\.name\.toLowerCase\(\)\.includes\(needle\)/);
  assert.match(source,/\.ip-library-admin/);
  assert.doesNotMatch(source,/#fontSelect|\.font-library|\.ip-font-picker/);
});
