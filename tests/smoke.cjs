const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
(async () => {
  const server = spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
  let browser;
  try{
    let ok=false;
    for(let i=0;i<40;i++){
      try{const r=await fetch('http://127.0.0.1:8765/index.html');if(r.ok){ok=true;break}}catch(e){}
      await sleep(150);
    }
    assert(ok,'Local web server did not start');
    const executable = process.env.CHROME_PATH || '/usr/bin/google-chrome';
    browser = await puppeteer.launch({headless:true,executablePath:executable,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.querySelectorAll('.emoji').length>0,{timeout:10000});
    let state=await page.evaluate(()=>({
      count:document.querySelectorAll('.emoji').length,
      fullHeight:document.getElementById('catalog').scrollHeight,
      viewport:document.getElementById('catalog').clientHeight,
      searchPlaceholder:document.querySelector('#search').placeholder
    }));
    console.log('initial',state);
    assert(state.count>0&&state.count<600,'Too many emojis mounted at once, virtualization may be broken');
    assert(state.fullHeight>state.viewport,'Missing complete scrolling height');
    await page.evaluate(()=>{const p=document.querySelector('#catalog');p.scrollTop=p.scrollHeight*.72});
    await sleep(450);
    state=await page.evaluate(()=>({count:document.querySelectorAll('.emoji').length,top:document.querySelector('#catalog').scrollTop}));
    console.log('scroll',state);
    assert(state.count>0&&state.count<600,'Scroll failed to window emoji DOM');
    await page.locator('#search').fill('сердце');
    await sleep(650);
    state=await page.evaluate(()=>({found:document.querySelector('#count').textContent,visible:document.querySelectorAll('.emoji').length}));
    console.log('search',state);
    assert(state.found.includes('Найдено:')&&state.visible>0,'Russian search returned no rendered emojis');
    await page.locator('#grid-toggle').click();
    await page.locator('#catalog-hex').fill('#123456');
    await page.locator('#catalog-hex').press('Tab');
    await sleep(100);
    const colors=await page.evaluate(()=>({
      catalog:getComputedStyle(document.getElementById('catalog')).backgroundColor,
      card:getComputedStyle(document.querySelector('.emoji')).backgroundColor,
      border:getComputedStyle(document.querySelector('.emoji')).borderColor
    }));
    console.log('colors',colors);
    assert.equal(colors.catalog,'rgb(18, 52, 86)','Custom background did not apply');
    assert.notEqual(colors.card,'rgb(248, 249, 250)','Card did not adapt to background');
    assert(!errors.length,'JavaScript errors: '+errors.join('; '));
    console.log('All emoji site browser smoke tests passed.');
  }finally{
    if(browser)await browser.close();
    server.kill();
  }
})().catch(err=>{console.error(err);process.exitCode=1});
