// Build-time only. The authored photos remain untouched in the repository.
// Emit fingerprinted WebP resources with identical dimensions and transparency
// only when there is a substantial byte saving. Keep every fallback original
// if decoding or transformation is unsupported.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

export async function optimizeStaticImages({directory,assets,html,seed,minimumBytes=300*1024}){
  const replacements=new Map(),stats=[],root=path.join(directory,'public');
  const originals=[...assets].filter(url=>/^\/static\/[a-f0-9]{64}\.(?:png|jpg|jpeg|webp)$/.test(url));
  for(const url of originals){
    const originalPath=path.join(root,url.slice(1));
    let bytes;
    try{bytes=fs.readFileSync(originalPath)}catch{continue}
    if(bytes.length<minimumBytes)continue;
    try{
      const info=await sharp(bytes,{limitInputPixels:120000000,failOn:'error'}).metadata();
      if(!info.width||!info.height||info.width*info.height<350000)continue;
      // High-quality WebP preserves the source resolution and alpha channel.
      // It is not used for uploaded customer artwork or R2 originals.
      const result=await sharp(bytes,{limitInputPixels:120000000,failOn:'error'})
        .webp({quality:94,alphaQuality:100,effort:4,smartSubsample:true})
        .toBuffer();
      if(result.length>bytes.length*.72)continue;
      const name=crypto.createHash('sha256').update(result).digest('hex')+'.webp';
      const next='/static/'+name;
      fs.writeFileSync(path.join(root,next.slice(1)),result);
      replacements.set(url,next);
      stats.push({source:url,optimized:next,originalBytes:bytes.length,optimizedBytes:result.length});
    }catch(error){
      // A problem with one media file must never break the storefront build.
      console.warn('[ImPrint image optimization skipped]',url,error.message);
    }
  }
  if(!replacements.size)return{html,seed,stats,bytesSaved:0};
  // Only URLs created by the extraction step are replaced; no source HTML,
  // images, layout rules, product metadata, or customer uploads are edited.
  const rewrite=value=>typeof value==='string'
    ?value.replace(/\/static\/[a-f0-9]{64}\.(?:png|jpg|jpeg|webp)/g,m=>replacements.get(m)||m)
    :value;
  html=rewrite(html);
  const visit=value=>{
    if(Array.isArray(value))return value.map(visit);
    if(value&&typeof value==='object')return Object.fromEntries(
      Object.entries(value).map(([key,item])=>[key,visit(item)]));
    return rewrite(value);
  };
  seed=visit(seed);
  for(const [oldUrl,newUrl] of replacements){
    // Keep original immutable URLs if references remain elsewhere in sources.
    // The replacement is content-addressed and safe for long-term caching.
    assets.add(newUrl);
    if(!html.includes(oldUrl)&&!JSON.stringify(seed).includes(oldUrl)){
      fs.rmSync(path.join(root,oldUrl.slice(1)),{force:true});
      assets.delete(oldUrl);
    }
  }
  return{html,seed,stats,bytesSaved:stats.reduce((sum,s)=>sum+s.originalBytes-s.optimizedBytes,0)};
}
