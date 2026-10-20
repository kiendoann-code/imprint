import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSEO} from '../src/seo.mjs';

const template='<!doctype html><html lang="vi"><head><title>ImPrint</title></head><body><main id="app"></main></body></html>';
const product={id:'tee',cat:'Áo thun',name:'Core Tee',description:'Áo in theo yêu cầu',price:205000,
 sale:0,stock:12,img:'/static/'+('a'.repeat(64))+'.webp',sizes:['M','L'],colors:['Trắng']};

test('SSR home retains crawlable product links but does not fetch throwaway product images before SPA hydration',async()=>{
 const response=renderSEO(new Request('https://imprint.io.vn/'),template,[product]);
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/href="\/san-pham\/tee"/);
 assert.match(html,/Core Tee/);
 assert.match(html,/205/);
 assert.doesNotMatch(html,/<img\b/i);
 assert.match(html,/id="seo-content"/);
});

test('product and category SEO pages preserve original image output',async()=>{
 const productPage=await renderSEO(new Request('https://imprint.io.vn/san-pham/tee'),template,[product]).text();
 assert.match(productPage,/img src="https:\/\/imprint\.io\.vn\/static\/a{64}\.webp"/);
 const category=await renderSEO(new Request('https://imprint.io.vn/danh-muc/ao-thun'),template,[product]).text();
 assert.match(category,/<img\b/);
});
