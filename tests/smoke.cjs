const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const puppeteer=require('puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
  let browser;
  try{
    let ready=false;
    for(let i=0;i<40;i++){
      try{const r=await fetch('http://127.0.0.1:8765/index.html');if(r.ok){ready=true;break}}catch(e){}
      await sleep(150);
    }
    assert(ready,'Local test server failed to start');
    browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());else if(m.text().includes('[emoji]'))console.log(m.text())});
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.querySelector('#emoji-viewport')?.width>0&&document.querySelector('#count').textContent.includes('1870'),{timeout:20000});
    await sleep(150);
    let state=await page.evaluate(()=>({
      atlas:!!spriteAtlas,atlasSize:spriteAtlas?[spriteAtlas.width,spriteAtlas.height]:[],
      atlasMs:Math.round(atlasMs),painted:lastDrawMetrics,
      domEmojiButtons:document.querySelectorAll('.emoji').length,
      fullHeight:document.querySelector('#catalog').scrollHeight,
      viewport:document.querySelector('#catalog').clientHeight,
      canvas:!!document.querySelector('#emoji-viewport')
    }));
    console.log('initial',state);
    assert(state.atlas,'Emoji texture atlas failed to generate');
    assert(state.domEmojiButtons===0,'Emoji DOM glyphs still exist');
    assert(state.fullHeight>state.viewport,'Not all emojis are reachable by scrolling');
    assert(state.painted.icons>0,'Canvas did not draw emoji sprites');
    for(let i=1;i<=14;i++){
      await page.evaluate(i=>{
        const catalog=document.querySelector('#catalog');
        catalog.scrollTop=(catalog.scrollHeight-catalog.clientHeight)*i/14;
      },i);
      await sleep(55);
    }
    state=await page.evaluate(()=>({
      scrollTop:document.querySelector('#catalog').scrollTop,
      frame:lastDrawMetrics,
      domButtons:document.querySelectorAll('.emoji').length
    }));
    console.log('after fast scroll',state);
    assert(state.frame.icons>0,'Icons did not draw at the end of scrolling');
    assert.equal(state.domButtons,0,'Scrolling reconstructed emoji buttons');
    await page.locator('#search').fill('сердце');
    await sleep(280);
    state=await page.evaluate(()=>({text:document.querySelector('#count').textContent,frame:lastDrawMetrics}));
    console.log('search',state);
    assert(state.text.includes('Найдено: 29'),'Russian search failed');
    assert(state.frame.icons>0,'Search icons did not render');
    // Hover must NEVER repaint the full emoji canvas: separate composited overlay.
    const hover=await page.evaluate(()=>{
      const canvas=document.querySelector('#emoji-viewport');
      const bounds=canvas.getBoundingClientRect();
      const pad=window.innerWidth<680?7:12;
      const usable=canvas.clientWidth-pad*2;
      const cellWidth=(usable-(effectiveColumns-1)*gap)/effectiveColumns;
      return {x:bounds.left+pad+cellWidth/2,y:bounds.top+48+cellHeight/2,step:cellWidth+gap};
    });
    await sleep(90);
    const countBefore=await page.evaluate(()=>canvasRenderCount);
    for(let i=0;i<6;i++)await page.mouse.move(hover.x+hover.step*i,hover.y);
    await sleep(130);
    const hoverState=await page.evaluate(()=>({
      repaintCount:canvasRenderCount,
      visible:!document.querySelector('#emoji-hover-indicator').hidden,
      hoveredName:hoveredItem?.name||null
    }));
    console.log('hover',hoverState);
    assert(hoverState.visible,'Hover outline did not appear');
    assert.equal(hoverState.repaintCount,countBefore,'Hover caused full emoji canvas redraw');
    assert(hoverState.hoveredName,'Hover did not identify an emoji');
    await page.locator('#grid-toggle').click();
    await page.locator('#catalog-hex').fill('#123456');
    await page.keyboard.press('Tab');
    await sleep(90);
    const colors=await page.evaluate(()=>({
      background:getComputedStyle(document.querySelector('#catalog')).backgroundColor,
      card:getComputedStyle(document.documentElement).getPropertyValue('--emoji-card-bg').trim(),
      border:getComputedStyle(document.documentElement).getPropertyValue('--emoji-card-border').trim()
    }));
    console.log('color controls',colors);
    assert.equal(colors.background,'rgb(18, 52, 86)');
    assert(colors.card.startsWith('#')&&colors.border.startsWith('#'));
    assert(!errors.length,'JavaScript browser errors: '+errors.join(' | '));
    console.log('Native emoji atlas and instant canvas scrolling: browser tests PASSED');
  }finally{
    if(browser)await browser.close();
    server.kill();
  }
})().catch(e=>{console.error(e);process.exitCode=1});
