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
    const ui=await page.evaluate(()=>({
      tabNames:[...document.querySelectorAll('#nav .tab')].map(t=>t.textContent.trim()),
      recentBelowTabs:document.querySelector('#nav').nextElementSibling?.id==='recent-section',
      recentLabel:document.querySelector('#recent-section h2')?.textContent,
      viewportPosition:getComputedStyle(document.querySelector('#emoji-sticky-surface')).position,
      canvasTop:document.querySelector('#emoji-viewport').getBoundingClientRect().top
    }));
    console.log('navigation',ui);
    assert(ui.tabNames.includes('Смайлики и люди')&&ui.tabNames.includes('Все эмодзи'));
    assert(ui.tabNames.every(x=>!/[😀🐶🥭⚽🏖🕯⭕🚩]/u.test(x)),'Category navigation still uses emoji icons');
    assert(ui.recentBelowTabs&&ui.recentLabel==='Недавно использованные','Recent section is not below categories');
    assert.equal(ui.viewportPosition,'sticky','Emoji canvas must use native sticky scrolling');
    await page.waitForFunction(()=>!!flagAtlasImage&&flagAtlasImage.naturalWidth>0,{timeout:10000});
    const flags=await page.evaluate(()=>{
      const all=entries.filter(e=>e.cat==='flags');
      const country=all.find(e=>e.native==='🇺🇸');
      const idx=country?.flagIndex??-1;
      const proof=document.createElement('canvas');
      proof.width=80;proof.height=80;
      if(idx>=0)proof.getContext('2d').drawImage(flagAtlasImage,(idx%ATLAS_COLS)*ATLAS_TILE,Math.floor(idx/ATLAS_COLS)*ATLAS_TILE,ATLAS_TILE,ATLAS_TILE,0,0,80,80);
      const img=proof.getContext('2d').getImageData(40,40,1,1).data;
      return {count:all.length,ready:flagAtlasImage.complete,pixels:[...img],sheet:[flagAtlasImage.naturalWidth,flagAtlasImage.naturalHeight]};
    });
    console.log('flags',flags);
    assert.equal(flags.count,269,'Flags are missing from the catalogue');
    assert(flags.ready&&flags.sheet[0]>=2560,'Pre-rendered country flag atlas did not load');
    assert(flags.pixels[3]>0,'Country flag tile is transparent or missing');
    // Body watermark must tile in both themes without obscuring the UI.
    const watermarkLight=await page.evaluate(()=>{
      const odd=getComputedStyle(document.body,'::before');
      const even=getComputedStyle(document.body,'::after');
      return {
        oddImage:odd.backgroundImage,evenImage:even.backgroundImage,
        oddMotion:odd.animationName,evenMotion:even.animationName,
        oddDuration:odd.animationDuration,evenDuration:even.animationDuration,
        width:odd.backgroundSize,
        pointerEvents:odd.pointerEvents
      };
    });
    console.log('animated watermark',watermarkLight);
    assert(watermarkLight.oddImage.includes('data:image/svg+xml'),'Left-drifting row missing');
    assert(watermarkLight.evenImage.includes('data:image/svg+xml'),'Right-drifting row missing');
    assert.equal(watermarkLight.width,'400px 280px');
    assert.equal(watermarkLight.oddMotion,'an4ous-drift-left','First row should move left');
    assert.equal(watermarkLight.evenMotion,'an4ous-drift-right','Second row should move right');
    assert.equal(watermarkLight.oddDuration,'140s');
    assert.equal(watermarkLight.evenDuration,'140s');
    assert.equal(watermarkLight.pointerEvents,'none');
    // The direction of travel must match the -35 degree word orientation.
    const motion=await page.evaluate(()=>{
      const keyframes=[...document.styleSheets].flatMap(sheet=>{
        try{return [...sheet.cssRules].filter(r=>r.type===CSSRule.KEYFRAMES_RULE)}catch(e){return []}
      });
      const target=name=>keyframes.find(rule=>rule.name===name)?.cssRules[1]?.style.transform||'';
      const before=getComputedStyle(document.body,'::before');
      const after=getComputedStyle(document.body,'::after');
      return {left:target('an4ous-drift-left'),right:target('an4ous-drift-right'),
        beforeTop:before.top,beforeBottom:before.bottom,afterTop:after.top};
    });
    console.log('diagonal drift',motion);
    assert(motion.left.includes('var(--watermark-neg-x')&&motion.left.includes('var(--watermark-tile-y'),
      'Left row does not track scaled diagonal tiles');
    assert(motion.right.includes('var(--watermark-tile-x')&&motion.right.includes('var(--watermark-neg-y'),
      'Right row does not track scaled diagonal tiles');
    assert.equal(motion.beforeTop,'-280px','Diagonal animation lacks top edge coverage');

    const getLabels=image=>{
      const svg=decodeURIComponent(image.match(/data:image\/svg\+xml,([^"']+)/)[1]);
      assert(svg.includes('rotate(-35)'),'Background word orientation changed');
      return [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(match=>match[1]);
    };
    assert.deepEqual(getLabels(watermarkLight.oddImage),['an4ous','emoji'],'First row checkerboard incorrect');
    assert.deepEqual(getLabels(watermarkLight.evenImage),['emoji','an4ous'],'Second row checkerboard incorrect');

    // Regression guard: every moving word must stay on its own diagonal lane.
    // The normal dot-product is invariant during the diagonal animation.
    const centers=image=>{
      const svg=decodeURIComponent(image.match(/data:image\/svg\+xml,([^"']+)/)[1]);
      return [...svg.matchAll(/translate\((\d+) (\d+)\)/g)].map(m=>[Number(m[1]),Number(m[2])]);
    };
    const n=[280/Math.hypot(400,280),400/Math.hypot(400,280)];
    const lanePeriod=400*n[0]; // x tile wrap (same as the 280px y wrap)
    const laneOffset=([x,y])=>{
      const offset=(x*n[0]+y*n[1])%lanePeriod;
      return offset<0?offset+lanePeriod:offset;
    };
    const onSameLane=(u,v)=>Math.min(Math.abs(u-v),lanePeriod-Math.abs(u-v))<1;
    const oddLane=centers(watermarkLight.oddImage).map(p=>laneOffset(p));
    const evenLane=centers(watermarkLight.evenImage).map(p=>laneOffset(p));
    assert(onSameLane(oddLane[0],oddLane[1]),'Odd words belong to different diagonal rows, causing collisions');
    assert(onSameLane(evenLane[0],evenLane[1]),'Even words belong to different diagonal rows, causing collisions');
    const laneGap=Math.min(Math.abs(oddLane[0]-evenLane[0]),lanePeriod-Math.abs(oddLane[0]-evenLane[0]));
    assert(laneGap>100,'Opposite-moving rows overlap instead of having a safe gap');
    const dot=([x,y])=>x*n[0]+y*n[1];
    assert(Math.abs(dot([-400,280]))<0.1&&Math.abs(dot([400,-280]))<0.1,
      'Animation moves words across rows rather than along them');
    console.log('non-overlapping diagonal lanes',{oddLane,evenLane,gap:laneGap});

    // Separate Background dropdown: size and speed are live CSS variables;
    // disabling the overlay removes both pseudo-elements entirely.
    await page.locator('#watermark-menu-toggle').click();
    const menuOpen=await page.evaluate(()=>({
      visible:!document.querySelector('#watermark-popover').hidden,
      label:document.querySelector('#watermark-menu-toggle').textContent,
      gridClosed:document.querySelector('#grid-popover').hidden
    }));
    assert(menuOpen.visible&&menuOpen.gridClosed&&menuOpen.label.includes('Фон'));
    await page.evaluate(()=>{
      const speed=document.querySelector('#watermark-speed');
      speed.value='2';
      speed.dispatchEvent(new Event('input',{bubbles:true}));
      const size=document.querySelector('#watermark-size');
      size.value='42';
      size.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const adjusted=await page.evaluate(()=>{
      const odd=getComputedStyle(document.body,'::before');
      return {
        size:odd.backgroundSize,
        duration:odd.animationDuration,
        negativeX:getComputedStyle(document.documentElement).getPropertyValue('--watermark-neg-x').trim(),
        speedLabel:document.querySelector('#watermark-speed-value').textContent,
        sizeLabel:document.querySelector('#watermark-size-value').textContent,
        savedSpeed:localStorage.getItem('emoji_watermark_speed'),
        savedSize:localStorage.getItem('emoji_watermark_size')
      };
    });
    console.log('watermark controls',adjusted);
    assert.equal(adjusted.size,'600px 420px','Text size did not scale the tiles proportionally');
    assert.equal(adjusted.duration,'105s','Speed did not change animation duration correctly');
    assert.equal(adjusted.negativeX,'-600px');
    assert.equal(adjusted.speedLabel,'2.0×');
    assert.equal(adjusted.sizeLabel,'42 px');
    assert.equal(adjusted.savedSpeed,'2');
    assert.equal(adjusted.savedSize,'42');

    const speedRange=await page.evaluate(()=>{
      const range=document.querySelector('#watermark-speed');
      const number=document.querySelector('#watermark-speed-number');
      return {min:range.min,max:range.max,step:range.step,numericMin:number.min,numericMax:number.max,numericValue:number.value};
    });
    assert.deepEqual([speedRange.min,speedRange.max,speedRange.step],['0','50','0.1'],'Slider must allow 0–50× in 0.1 increments');
    assert.deepEqual([speedRange.numericMin,speedRange.numericMax,speedRange.numericValue],['0','50','2'],'Numeric input is not synchronized');
    // Speed 0 keeps the artwork visible while pausing all animation.
    await page.evaluate(()=>{
      const control=document.querySelector('#watermark-speed');
      control.value='0';
      control.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const zero=await page.evaluate(()=>({
      paused:document.documentElement.classList.contains('watermark-paused'),
      overlay:getComputedStyle(document.body,'::before').display,
      state:getComputedStyle(document.body,'::before').animationPlayState,
      duration:getComputedStyle(document.body,'::before').animationDuration,
      label:document.querySelector('#watermark-speed-value').textContent,
      saved:localStorage.getItem('emoji_watermark_speed'),
      number:document.querySelector('#watermark-speed-number').value
    }));
    console.log('watermark stopped at zero',zero);
    assert(zero.paused&&zero.state==='paused'&&zero.overlay!=='none','Speed 0 should freeze but not hide the background');
    assert(!zero.duration.includes('Infinity')&&!zero.duration.includes('NaN'),'Speed 0 generated invalid duration');
    assert(zero.label.includes('0×')&&zero.saved==='0'&&zero.number==='0');
    // Max speed of 50× must generate a short finite period and persist.
    await page.evaluate(()=>{
      const control=document.querySelector('#watermark-speed-number');
      control.value='50';
      control.dispatchEvent(new Event('change',{bubbles:true}));
    });
    const maxSpeed=await page.evaluate(()=>({
      paused:document.documentElement.classList.contains('watermark-paused'),
      state:getComputedStyle(document.body,'::before').animationPlayState,
      duration:getComputedStyle(document.body,'::before').animationDuration,
      label:document.querySelector('#watermark-speed-value').textContent,
      saved:localStorage.getItem('emoji_watermark_speed'),
      slider:document.querySelector('#watermark-speed').value
    }));
    console.log('watermark max speed',maxSpeed);
    assert(!maxSpeed.paused&&maxSpeed.state==='running','Speed 50 must resume the background');
    assert.equal(maxSpeed.duration,'4.2s'); // 140 × 1.5 / 50
    assert(maxSpeed.label.includes('50')&&maxSpeed.saved==='50'&&maxSpeed.slider==='50');

    await page.locator('#watermark-toggle').click();
    const off=await page.evaluate(()=>({
      cls:document.documentElement.classList.contains('watermark-off'),
      visible:getComputedStyle(document.body,'::before').display,
      saved:localStorage.getItem('emoji_watermark_enabled'),
      disabled:document.querySelector('#watermark-speed').disabled
    }));
    assert(off.cls&&off.visible==='none'&&off.saved==='false'&&off.disabled,'Disabling background did not turn off its animation');
    await page.locator('#watermark-toggle').click();
    const on=await page.evaluate(()=>({
      cls:document.documentElement.classList.contains('watermark-off'),
      saved:localStorage.getItem('emoji_watermark_enabled'),
      enabled:!document.querySelector('#watermark-speed').disabled
    }));
    assert(!on.cls&&on.saved==='true'&&on.enabled,'Re-enabling background failed');
    await page.keyboard.press('Escape');
    assert(await page.evaluate(()=>document.querySelector('#watermark-popover').hidden),'Background menu did not close on Escape');
    await page.evaluate(()=>{
      document.querySelector('#watermark-speed').value='1';
      document.querySelector('#watermark-speed').dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('#watermark-size').value='28';
      document.querySelector('#watermark-size').dispatchEvent(new Event('input',{bubbles:true}));
    });


    await page.evaluate(()=>{isDark=true;applyTheme()});
    const watermarkDark=await page.evaluate(()=>({
      oddImage:getComputedStyle(document.body,'::before').backgroundImage,
      evenImage:getComputedStyle(document.body,'::after').backgroundImage,
      body:getComputedStyle(document.body).backgroundColor
    }));
    assert(watermarkDark.oddImage.includes('data:image/svg+xml'),'Dark first row absent');
    assert(watermarkDark.evenImage.includes('data:image/svg+xml'),'Dark second row absent');
    assert.equal(watermarkDark.body,'rgb(14, 14, 14)');
    assert.notEqual(watermarkDark.oddImage,watermarkLight.oddImage);
    assert.deepEqual(getLabels(watermarkDark.oddImage),['an4ous','emoji']);
    assert.deepEqual(getLabels(watermarkDark.evenImage),['emoji','an4ous']);
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    const reducedMotion=await page.evaluate(()=>({
      odd:getComputedStyle(document.body,'::before').animationName,
      even:getComputedStyle(document.body,'::after').animationName
    }));
    assert.equal(reducedMotion.odd,'none','Accessibility: animation ignores reduced motion setting');
    assert.equal(reducedMotion.even,'none','Accessibility: animation ignores reduced motion setting');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await page.evaluate(()=>{isDark=false;applyTheme()});
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
      domButtons:document.querySelectorAll('.emoji').length,
      canvasTop:document.querySelector('#emoji-viewport').getBoundingClientRect().top
    }));
    console.log('after fast scroll',state);
    assert(state.frame.icons>0,'Icons did not draw at the end of scrolling');
    assert.equal(state.domButtons,0,'Scrolling reconstructed emoji buttons');
    assert(Math.abs(state.canvasTop-ui.canvasTop)<2,'Canvas jumps instead of staying fixed during native scroll');
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
      hoveredName:hoveredItem?.name||null,
      tooltipVisible:!document.querySelector('#emoji-hover-tooltip').hidden,
      tooltipText:document.querySelector('#emoji-hover-tooltip').textContent
    }));
    console.log('hover',hoverState);
    assert(hoverState.visible,'Hover outline did not appear');
    assert.equal(hoverState.repaintCount,countBefore,'Hover caused full emoji canvas redraw');
    assert(hoverState.hoveredName,'Hover did not identify an emoji');
    assert(hoverState.tooltipVisible,'Russian emoji name tooltip was not shown');
    assert.equal(hoverState.tooltipText,hoverState.hoveredName,'Tooltip name mismatch');
    const tooltipAlignment=await page.evaluate(()=>{
      const card=document.querySelector('#emoji-hover-indicator').getBoundingClientRect();
      const tooltip=document.querySelector('#emoji-hover-tooltip').getBoundingClientRect();
      return {cardCenter:card.left+card.width/2,labelCenter:tooltip.left+tooltip.width/2,
        withinBlock:tooltip.left>=document.querySelector('#emoji-viewport').getBoundingClientRect().left-2};
    });
    console.log('centered tooltip',tooltipAlignment);
    assert(Math.abs(tooltipAlignment.cardCenter-tooltipAlignment.labelCenter)<2,'Tooltip is off-center from hovered emoji');
    assert(tooltipAlignment.withinBlock,'Tooltip extends outside its visible area');
    const recent=await page.evaluate(()=>{
      history=['😂','🌌'];
      renderRecent();
      const buttons=[...document.querySelectorAll('#recent-grid button')];
      const b=buttons[0].getBoundingClientRect(),img=buttons[0].querySelector('canvas').getBoundingClientRect();
      return {
        labels:buttons.map(x=>x.dataset.label),
        count:document.querySelector('#recent-count').textContent,
        centered:Math.abs((b.left+b.width/2)-(img.left+img.width/2))<1
          &&Math.abs((b.top+b.height/2)-(img.top+img.height/2))<1,
        iconCanvases:buttons.every(x=>x.querySelector('canvas'))
      };
    });
    console.log('recent',recent);
    assert.equal(recent.labels.length,2,'Recent emoji strip did not populate');
    assert(recent.labels.every(Boolean),'Recent entries have no Russian names');
    assert(recent.count.includes('2'),'Recent count not updated');
    assert(recent.centered&&recent.iconCanvases,'Recent emoji icons are not centered');
    await page.evaluate(()=>{
      hideFrames=true;
      applyFrames();
    });
    const frameless=await page.evaluate(()=>{
      const recent=document.querySelector('.recent-emoji');
      const style=getComputedStyle(recent);
      return {background:style.backgroundColor,border:style.borderTopWidth};
    });
    console.log('frameless recent',frameless);
    assert.equal(frameless.background,'rgba(0, 0, 0, 0)','Recent emoji still has a background after disabling frames');
    assert.equal(frameless.border,'0px','Recent emoji still has a border after disabling frames');
    await page.evaluate(()=>{
      hideFrames=false;
      applyFrames();
    });
    // Recent emoji hover must not scroll to an off-screen catalogue item.
    await page.locator('#clear').click();
    await sleep(140);
    const recentCoords=await page.evaluate(()=>{
      const b=document.querySelector('#recent-grid button').getBoundingClientRect();
      const c=document.querySelector('#catalog');
      c.scrollTop=c.scrollHeight-c.clientHeight;
      return {x:b.left+b.width/2,y:b.top+b.height/2};
    });
    await sleep(120);
    const beforeOffscreen=await page.evaluate(()=>document.querySelector('#catalog').scrollTop);
    await page.mouse.move(recentCoords.x,recentCoords.y);
    await sleep(180);
    const offscreen=await page.evaluate(()=>({
      scrollTop:document.querySelector('#catalog').scrollTop,
      highlighted:!document.querySelector('#emoji-hover-indicator').hidden
    }));
    console.log('recent hover offscreen',offscreen);
    assert.equal(offscreen.scrollTop,beforeOffscreen,'Recent hover scrolled to an off-screen emoji');
    assert(!offscreen.highlighted,'Off-screen emoji was highlighted');
    await page.mouse.move(3,3);
    await sleep(55);
    // If the catalogue item is already in view, hover still highlights it.
    await page.evaluate(()=>{
      const native=document.querySelector('#recent-grid button').dataset.recentEmoji;
      const match=findRecentInModel(native);
      const c=document.querySelector('#catalog');
      c.scrollTop=Math.max(0,positions[match.row]-20);
    });
    await sleep(130);
    await page.mouse.move(recentCoords.x,recentCoords.y);
    await sleep(180);
    const located=await page.evaluate(()=>({
      hoveredName:hoveredItem?.name,
      recentName:document.querySelector('#recent-grid button').dataset.label,
      indicatorVisible:!document.querySelector('#emoji-hover-indicator').hidden,
      tooltipVisible:!document.querySelector('#emoji-hover-tooltip').hidden,
      scrollTop:document.querySelector('#catalog').scrollTop,
      recentNative:recentHoverNative
    }));
    console.log('recent hover locator',located);
    assert.equal(located.hoveredName,located.recentName,'Recent hover did not highlight matching catalogue emoji');
    assert(located.indicatorVisible&&located.tooltipVisible,'Recent hover did not show catalogue indicator and Russian name');
    assert.equal(located.recentNative,'😂');
    await page.mouse.move(3,3);
    await sleep(40);
    const stopped=await page.evaluate(()=>({
      recentNative:recentHoverNative,
      visible:!document.querySelector('#emoji-hover-indicator').hidden
    }));
    assert.equal(stopped.recentNative,null,'Recent hover did not clear after pointer left');
    assert(!stopped.visible,'Recent highlight persisted after leaving');
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
