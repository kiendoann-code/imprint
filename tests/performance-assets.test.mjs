import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {optimizeStaticImages} from '../scripts/optimize-images.mjs';

test('large bundled photos are converted to fingerprinted WebP without dimensions/layout changes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imprint-images-'));
 try{
  const folder=path.join(dir,'public','static');
  fs.mkdirSync(folder,{recursive:true});
  const png=await sharp({create:{width:1800,height:1200,channels:4,background:'#d0b9aaff'}})
    .png({compressionLevel:0}).toBuffer();
  const old='/static/'+crypto.createHash('sha256').update('original-src').digest('hex')+'.png';
  fs.writeFileSync(path.join(dir,'public',old.slice(1)),png);
  const assets=new Set([old]);
  const initialHtml='<img src="'+old+'" alt="Original layout">';
  const initialSeed={products:[{id:'tee',img:old,details:{preview:old}}]};
  const result=await optimizeStaticImages({directory:dir,assets,html:initialHtml,seed:initialSeed});
  assert.equal(result.stats.length,1);
  assert(result.bytesSaved>0);
  assert.match(result.seed.products[0].img,/^\/static\/[a-f0-9]{64}\.webp$/);
  assert.equal(result.seed.products[0].details.preview,result.seed.products[0].img);
  assert(result.html.includes(result.seed.products[0].img));
  assert(result.html.includes('alt="Original layout"'));
  const file=path.join(dir,'public',result.seed.products[0].img.slice(1));
  const meta=await sharp(file).metadata();
  assert.equal(meta.width,1800);assert.equal(meta.height,1200);
  assert(assets.has(result.seed.products[0].img));
  assert(!assets.has(old));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('small resources remain unmodified',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'imprint-image-small-'));
 try{
  const url='/static/'+('a'.repeat(64))+'.png';
  fs.mkdirSync(path.join(dir,'public','static'),{recursive:true});
  fs.writeFileSync(path.join(dir,'public',url.slice(1)),Buffer.from('tiny'));
  const result=await optimizeStaticImages({directory:dir,assets:new Set([url]),html:url,seed:{img:url}});
  assert.equal(result.html,url);assert.equal(result.seed.img,url);assert.equal(result.stats.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
