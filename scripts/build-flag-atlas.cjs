/**
 * Build a single, cached PNG atlas of all flags from Twemoji SVG artwork.
 * System emoji fonts on Windows/Chrome often render country regional-indicator
 * sequences as letters. All 269 flags are pre-rendered during the site build,
 * so there are no network calls or font rasterization during scrolling.
 * Artwork: Twemoji CC BY 4.0, https://github.com/jdecked/twemoji
 */
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../emoji-data.json'),'utf8'));
const flags=source.filter(row=>row[0]==='flags');
const TILE=80,COLS=32;
const RETRIES=2;
const base='https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/';
const toIds=emoji=>[...emoji].map(c=>c.codePointAt(0).toString(16));
async function getSvg(emoji){
  const ids=toIds(emoji);
  const candidates=[ids.join('-'),ids.filter(s=>s!=='fe0f').join('-')];
  for(const stem of [...new Set(candidates)]){
    const url=base+stem+'.svg';
    for(let attempt=0;attempt<=RETRIES;attempt++){
      try{
        const ctl=new AbortController();
        const timeout=setTimeout(()=>ctl.abort(),16000);
        let r;
        try{r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':'emoji-site-flag-atlas-builder'}})}
        finally{clearTimeout(timeout)}
        if(r.status===404)break;
        if(!r.ok)throw Error('HTTP '+r.status);
        const body=Buffer.from(await r.arrayBuffer());
        if(body.toString('utf8',0,150).includes('<svg'))return body;
        throw Error('Not SVG: '+stem);
      }catch(error){
        if(attempt===RETRIES)console.warn('Request failed',stem,error.message);
        else await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
      }
    }
  }
  return null;
}
async function run(){
  const layers=new Array(flags.length);
  let next=0,missing=[];
  // Concurrent but bounded; do not hammer the upstream repository.
  await Promise.all(Array.from({length:14},async()=>{
    while(next<flags.length){
      const index=next++;
      const [category,native,name]=flags[index];
      const svg=await getSvg(native);
      if(!svg){missing.push(native+' '+name);continue;}
      try{
        const png=await sharp(svg,{density:144}).resize(72,72,{fit:'contain'}).png().toBuffer();
        layers[index]={input:png,left:(index%COLS)*TILE+4,top:Math.floor(index/COLS)*TILE+4};
      }catch(e){missing.push(native+' '+name+': '+e.message);}
    }
  }));
  const countryCount=flags.filter(e=>[...e[1]].length===2).length;
  const missingCountry=missing.filter(s=>[...s.split(' ')[0]].length===2);
  if(missingCountry.length)throw Error('Country flags missing: '+missingCountry.join(', '));
  if(missing.length)console.warn('Missing non-country artwork (system fallback):',missing);
  const width=COLS*TILE,height=Math.ceil(flags.length/COLS)*TILE;
  const output=path.join(__dirname,'../flag-atlas.png');
  await sharp({create:{width,height,channels:4,background:'#00000000'}})
    .composite(layers.filter(Boolean)).png({compressionLevel:9,palette:false}).toFile(output);
  console.log('Flag atlas ready:',flags.length,'flags',countryCount,'country pairs',missing.length,'fallbacks',Math.round(fs.statSync(output).size/1024)+' KB');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
