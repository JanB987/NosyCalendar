import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { styleSettingsHost } from '../tests/style-settings-host.mjs';
import { numeric, colors, prefix, groups } from './style-catalog.mjs';
import { browserExecutable } from './browser-executable.mjs';
await import('./styles.mjs');
await mkdir('.test-build/browser',{recursive:true});
await build({entryPoints:['tests/browser-harness.ts'],outfile:'.test-build/browser/app.js',bundle:true,platform:'browser',format:'iife',alias:{obsidian:'./tests/obsidian-stub.ts'}});
await writeFile('.test-build/browser/index.html',`<!doctype html><html><head><meta charset="UTF-8"><style>
body{margin:12px;font:13px system-ui;--font-interface:system-ui;--font-ui-small:13px;--background-primary:#fff;--background-secondary:#f5f5f5;--text-normal:#222;--text-muted:#666;--text-faint:#999;--interactive-accent:#6750a4;--text-on-accent:#fff;--background-modifier-border:#ddd;--interactive-normal:#eee;--interactive-hover:#ddd;--background-modifier-hover:#eee;--background-modifier-border-hover:#aaa}
body.theme-dark{--background-primary:#202020;--background-secondary:#262626;--text-normal:#ddd;--text-muted:#aaa;--text-faint:#666;--background-modifier-border:#444;--interactive-normal:#303030;--interactive-hover:#444;background:#202020;color:#ddd}
</style><style>${await readFile('styles.css','utf8')}</style></head><body class="theme-light"><div id="unrelated" class="fc"><span class="fc-event fc-h-event">Other calendar</span></div><script src="app.js"></script></body></html>`);
const profile=path.resolve('.test-build/browser/profile-'+Date.now());
const executable = browserExecutable();
const browser=spawn(executable,[
  '--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-component-update','--disable-sync',
  '--remote-debugging-port=0','--user-data-dir='+profile, 'about:blank'
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket,nextId=0,session,stderr='';const pending=new Map(), pageErrors=[];
browser.on('error', error => { stderr += error.message; });
browser.stderr.on('data',data=>{stderr=(stderr+data).slice(-2000)});
const cdp=(method,params={},targetSession=session)=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}. ${stderr}`))},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(targetSession?{sessionId:targetSession}:{})}));});
const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const palette=styleSettingsHost();let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const command=async expression=>evaluate(`(async()=>{${expression}})()`);
const apply=async settings=>{const output=palette.apply(settings);await evaluate(`nosyHarness.style(${JSON.stringify(output.css)},${JSON.stringify(output.classes)})`);};
const cssValue=(selector,property)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});return el?getComputedStyle(el).getPropertyValue(${JSON.stringify(property)}):null})()`);
const rect=selector=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
const mouse=async(type,x,y)=>cdp('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1});
const rgb=hex=>`rgb(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')})`;
try{
  let endpoint;
  for(let i=0;i<150;i++){try{const [port,resource]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');endpoint=`ws://127.0.0.1:${port.trim()}${resource.trim()}`;break;}catch{await wait(100);}}
  if(!endpoint)throw new Error('Headless browser did not expose its isolated debugging endpoint. '+stderr);
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data),p=pending.get(msg.id);if(msg.method==='Runtime.exceptionThrown')pageErrors.push(msg.params.exceptionDetails.exception?.description??msg.params.exceptionDetails.text);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);}});
  const target=await cdp('Target.createTarget',{url:'about:blank'},null);
  session=(await cdp('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:1050,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:pathToFileURL(path.resolve('.test-build/browser/index.html')).href});
  for(let i=0;i<80;i++){if(await evaluate('Boolean(window.nosyHarness)'))break;await wait(100);}
  check(await evaluate('Boolean(window.nosyHarness)'),'real browser harness loaded: '+pageErrors.join('; '));
  console.log(`Isolated headless browser (${path.basename(executable)}) loaded real calendar.`);
  await command(`nosyHarness.calendar.setOption('now','2026-11-23T09:30:00');await nosyHarness.mode('timeGridWeek');await nosyHarness.frame();`);
  const baseline=await evaluate('nosyHarness.snapshot()');const unrelated=await cssValue('#unrelated .fc-event','border-radius');
  const changed=Object.fromEntries(numeric.map(c=>['nosy-calendar@@'+c.id,Math.min(c.max,c.default+c.step*2)]));
  const seen=new Set();
  for(const mode of ['timeGridWeek','timeGridDay','dayGridMonth','multiMonthYear']){
    await apply({});await evaluate(`nosyHarness.mode('${mode}')`);
    if(mode==='dayGridMonth'||mode==='multiMonthYear')await command(`nosyHarness.calendar.setOption('dayMaxEvents',1);await nosyHarness.frame();document.querySelector('.fc-daygrid-more-link')?.click();await nosyHarness.frame();`);
    const before={};
    for(const c of numeric)if(!c.selector.includes(':hover')&&!c.selector.includes(':focus'))before[c.id]=await cssValue(c.selector,c.property.split(',')[0].trim());
    await apply(changed);
    if(mode==='dayGridMonth'||mode==='multiMonthYear')await command(`if(!document.querySelector('.fc-popover'))document.querySelector('.fc-daygrid-more-link')?.click();await nosyHarness.frame();`);
    for(const c of numeric){
      if(c.selector.includes(':hover')||c.selector.includes(':focus'))continue;
      const after=await cssValue(c.selector,c.property.split(',')[0].trim());
      if(before[c.id]===null||after===null)continue;
      check(after!==before[c.id],`${c.id} must change its actual target (${mode}): ${after}`);seen.add(c.id);
    }
    const expected=mode==='dayGridMonth'?'2026-W44–W49':mode==='multiMonthYear'?'2026-W01–W53':'2026-W48';
    check(await evaluate(`document.querySelector('.nosy-iso-indicator').textContent`)===expected,mode+' ISO heading');
    if(mode==='dayGridMonth'||mode==='multiMonthYear')check(await evaluate(`document.querySelectorAll('.fc-daygrid-week-number').length>0`),mode+' native row numbers');
    console.log('Checked live controls and ISO heading:',mode);
  }
  // Theme/custom checks are generated by the installed 1.0.9 settings engine, not a replacement system.
  const custom={};for(const [group]of groups)custom['nosy-calendar@@'+prefix+group+'-colors']=prefix+group+'-custom';
  colors.forEach((c,i)=>{custom['nosy-calendar@@'+c.id+'@@light']='#'+(0x244466+i*0x020301).toString(16).padStart(6,'0');custom['nosy-calendar@@'+c.id+'@@dark']='#'+(0x875533+i*0x010203).toString(16).padStart(6,'0');});
  const targets={
    'toolbar-fg':['.fc-toolbar-title','color'],'toolbar-bg':['.fc-prev-button','background-color'],'toolbar-border':['.fc-prev-button','border-top-color'],
    'header-bg':['.fc-col-header-cell','background-color'],'weekday-fg':['.nosy-weekday','color'],'header-date-fg':['.nosy-header-date','color'],'header-separator':['.fc-col-header-cell','border-bottom-color'],
    'day-fg':['.fc-daygrid-day:not(.fc-day-other):not(.fc-day-today) .fc-daygrid-day-number','color'],'today-fg':['.fc-day-today .fc-daygrid-day-number','color'],'outside-fg':['.fc-day-other .fc-daygrid-day-number','color'],'month-title-fg':['.fc-multimonth-title','color'],
    'grid-horizontal':['.fc-daygrid-day','border-bottom-color'],'grid-vertical':['.fc-daygrid-day','border-left-color'],'minor-line':['.fc-timegrid-slot-minor','border-top-color'],'major-line':['.fc-timegrid-slot-lane:not(.fc-timegrid-slot-minor)','border-top-color'],'day-separator':['.fc-timegrid-col','border-left-color'],'frame':['.fc-scrollgrid','border-top-color'],
    'event-fill':['.nosy-event[aria-label*="Short · Fallback"]','background-color'],'event-edge':['.nosy-event[aria-label*="Short · Fallback"]','border-top-color'],'event-text':['.nosy-event[aria-label*="Short · Fallback"] .fc-event-main','color'],
    'badge-fg':['.nosy-role-label','color'],'badge-bg':['.nosy-role-label','background-color'],'axis-fg':['.fc-timegrid-slot-label','color'],'axis-bg':['.fc-timegrid-slot-label','background-color'],'all-day-fg':['.fc-timegrid-axis','color'],'all-day-bg':['.fc-timegrid-axis','background-color'],
    'today-bg':['.fc-daygrid-day.fc-day-today','background-color'],'weekend-bg':['.fc-daygrid-day.fc-day-sat:not(.fc-day-today):not(.fc-day-other)','background-color'],'outside-bg':['.fc-daygrid-day.fc-day-other','background-color'],'now':['.fc-timegrid-now-indicator-line','border-top-color'],
    'week-fg':['.nosy-iso-indicator','color'],'week-bg':['.nosy-iso-indicator','background-color'],'week-border':['.nosy-iso-indicator','border-top-color'],'week-row-fg':['.fc-daygrid-week-number','color'],'week-row-bg':['.fc-daygrid-week-number','background-color'],
    'overflow-fg':['.fc-more-link','color'],'popover-bg':['.fc-popover','background-color'],'popover-border':['.fc-popover','border-top-color']
  };
  const colorSeen=new Set();
  await evaluate(`document.body.classList.replace('theme-dark','theme-light')`);await apply(custom);
  for(const mode of ['timeGridWeek','dayGridMonth','multiMonthYear']){
    await evaluate(`nosyHarness.mode('${mode}')`);
    if(mode!=='timeGridWeek')await command(`nosyHarness.calendar.setOption('dayMaxEvents',1);await nosyHarness.frame();document.querySelector('.fc-daygrid-more-link')?.click();await nosyHarness.frame();`);
    for(const [key,[selector,property]]of Object.entries(targets)){
      const actual=await cssValue(selector,property);if(actual===null)continue;
      const expected=rgb(custom['nosy-calendar@@'+prefix+key+'@@light']);
      check(actual===expected,`${key} actual color binding: ${actual} versus ${expected}`);colorSeen.add(prefix+key);
    }
  }
  await apply(custom);await evaluate(`nosyHarness.mode('timeGridWeek')`);
  check(await cssValue('.nosy-weekday','color')===rgb(custom['nosy-calendar@@nosy-calendar-weekday-fg@@light']),'custom light header text');
  await evaluate(`document.body.classList.replace('theme-light','theme-dark');nosyHarness.frame()`);
  check(await cssValue('.nosy-weekday','color')===rgb(custom['nosy-calendar@@nosy-calendar-weekday-fg@@dark']),'custom dark header text');
  check(await cssValue('.nosy-event[aria-label*="Meeting"]','background-color')==='rgb(251, 209, 217)','conditional fill outranks fallback');
  check(await cssValue('.nosy-event[aria-label*="Meeting"]','border-color')==='rgb(50, 92, 255)','role edge outranks fallback');
  check(await cssValue('.nosy-event[aria-label*="Meeting"] .fc-event-main','color')==='rgb(0, 0, 0)','conditional contrast outranks global text');
  check(await cssValue('.nosy-role-label','color')===rgb(custom['nosy-calendar@@nosy-calendar-badge-fg@@dark']),'badge text independent');
  check(await cssValue('#unrelated .fc-event','border-radius')===unrelated,'other calendars unchanged');
  await apply(Object.fromEntries(Object.entries(custom).filter(([key])=>key.endsWith('-colors'))));
  check(await cssValue('.nosy-weekday','color')==='rgb(170, 170, 170)','custom dark reset uses dark picker default');
  await apply({});check(await cssValue('.nosy-weekday','color')==='rgb(170, 170, 170)','Theme mode uses active theme');
  const axisBefore=await rect('.fc-timegrid-slot-label');
  await apply({'nosy-calendar@@nosy-calendar-axis-width':100});
  check((await rect('.fc-timegrid-slot-label')).width>axisBefore.width+20,'axis control expands the measured table column');
  await evaluate(`nosyHarness.mode('multiMonthYear')`);await apply({'nosy-calendar@@nosy-calendar-year-min-width':400});
  check((await rect('.fc-multimonth-month')).width>=400,'Year minimum width controls actual month geometry');
  await apply({});
  // Navigation and empty-source checks, including ISO week-year boundaries.
  for(const [mode,date,label]of [['timeGridWeek','2025-12-29','2026-W01'],['timeGridDay','2027-01-03','2026-W53'],['multiMonthYear','2027-06-01','2026-W53 – 2027-W52']]){
    await evaluate(`nosyHarness.mode('${mode}','${date}')`);check(await evaluate(`document.querySelector('.nosy-iso-indicator').textContent`)===label,label);
  }
  await evaluate('nosyHarness.empty(true)');check(await evaluate(`document.querySelector('.nosy-iso-indicator').textContent`)==='2026-W53 – 2027-W52','empty results retain displayed ISO range');await evaluate('nosyHarness.empty(false)');
  check((await evaluate('nosyHarness.snapshot()')).notes===baseline.notes,'style/week navigation never writes notes');
  check((await evaluate('nosyHarness.snapshot()')).config===baseline.config,'style/week navigation never writes per-view configuration');
  // Physical browser pointer interactions after live sizing changes.
  await evaluate(`nosyHarness.mode('timeGridWeek')`);
  const sized={'nosy-calendar@@nosy-calendar-slot-height':40,'nosy-calendar@@nosy-calendar-event-min-height':44,'nosy-calendar@@nosy-calendar-event-title-size':16,'nosy-calendar@@nosy-calendar-event-padding-y':5};
  await apply(sized);await command(`nosyHarness.calendar.scrollToTime('08:00');await nosyHarness.frame();`);
  const period=(await evaluate('nosyHarness.snapshot()')).period;
  const meeting='.nosy-event[aria-label*="Meeting · Scheduled"]';
  let r=await rect(meeting),x=r.x+Math.min(r.width/2,30),y=r.y+15;
  check(await cssValue(meeting+' .fc-event-resizer-end','opacity')==='0','handles hidden without hover');
  await mouse('mouseMoved',x,y);await wait(50);check(await cssValue(meeting+' .fc-event-resizer-end','opacity')==='1','handles appear on hover');
  await mouse('mousePressed',x,y);await mouse('mouseMoved',x,y+80);await wait(50);
  check(parseFloat(await cssValue('.fc-event-dragging .fc-event-title','font-size'))===16,'floating clone inherits the pinned event typography');
  check(await cssValue('.fc-event-dragging','background-color')==='rgb(251, 209, 217)','floating clone retains conditional fill');
  const during={...sized,'nosy-calendar@@nosy-calendar-slot-height':48,'nosy-calendar@@nosy-calendar-event-title-size':20};
  await apply(during);
  check(parseFloat(await cssValue('.fc-timegrid-slot','height'))===40,'slot geometry frozen during gesture');
  check(parseFloat(await cssValue(meeting+' .fc-event-title','font-size'))===16,'text geometry frozen during gesture');
  await mouse('mouseReleased',x,y+80);await wait(300);await evaluate('nosyHarness.frame()');
  let snap=await evaluate('nosyHarness.snapshot()');
  check(snap.writes===1,'native drag writes once');
  check(JSON.parse(snap.notes)[0].scheduled==='2026-11-23T10:00','native drag uses accurate post-style hit coordinates');
  check(parseFloat(await cssValue('.fc-timegrid-slot','height'))===48,'deferred style applied after gesture');
  check(snap.period===period,'styles retain displayed period');
  // Both endpoint handles remain physical native resize targets after the style change.
  await command(`nosyHarness.calendar.scrollToTime('09:00');await nosyHarness.frame();`);
  r=await rect(meeting);await mouse('mouseMoved',r.x+r.width/2,r.y+15);await wait(50);
  let h=await rect(meeting+' .fc-event-resizer-end');x=h.x+h.width/2;y=h.y+h.height/2;
  check(h.height>=8,'resize hit area remains usable');
  await mouse('mousePressed',x,y);await mouse('mouseMoved',x,y+48);await mouse('mouseReleased',x,y+48);await wait(300);await evaluate('nosyHarness.frame()');
  snap=await evaluate('nosyHarness.snapshot()');check(snap.writes===2,'native end resize writes once');
  check(JSON.parse(snap.notes)[0].scheduled==='2026-11-23T10:00'&&JSON.parse(snap.notes)[0].until==='2026-11-23T11:30','resize keeps opposite endpoint fixed: '+JSON.stringify(JSON.parse(snap.notes)[0]));
  r=await rect(meeting);await mouse('mouseMoved',r.x+20,r.y+15);h=await rect(meeting+' .fc-event-resizer-start');x=h.x+h.width/2;y=h.y+h.height/2;
  await mouse('mousePressed',x,y);await mouse('mouseMoved',x,y-48);await mouse('mouseReleased',x,y-48);await wait(300);await evaluate('nosyHarness.frame()');
  snap=await evaluate('nosyHarness.snapshot()');check(snap.writes===3,'native start resize writes once');
  check(JSON.parse(snap.notes)[0].scheduled==='2026-11-23T09:30'&&JSON.parse(snap.notes)[0].until==='2026-11-23T11:30','start resize keeps End fixed');
  await wait(450);r=await rect(meeting);await mouse('mousePressed',r.x+20,r.y+15);await mouse('mouseReleased',r.x+20,r.y+15);await wait(50);check((await evaluate('nosyHarness.snapshot()')).opens===1,'native click opens note');
  // The two pseudo-state controls consume their settings with actual focus/hover.
  await apply({...custom,...sized,'nosy-calendar@@nosy-calendar-hover-width':3,'nosy-calendar@@nosy-calendar-focus-width':4});
  r=await rect(meeting);await mouse('mouseMoved',r.x+20,r.y+15);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await evaluate(`document.querySelector(${JSON.stringify(meeting)}).focus()`);
  const visiblePoint=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(meeting)}),r=el.getBoundingClientRect();for(const dy of [15,Math.min(r.height/2,35),r.height-15])for(const fraction of [.2,.5,.8]){const x=r.x+r.width*fraction,y=r.y+dy;if(document.elementFromPoint(x,y)?.closest('.nosy-event')===el)return {x,y};}return null;})()`);
  check(Boolean(visiblePoint),'focused event has an unobstructed pointer target');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:visiblePoint.x,y:visiblePoint.y,buttons:0});await wait(30);
  check((await cssValue(meeting,'box-shadow')).includes('3px'),'hover width applies: '+await cssValue(meeting,'box-shadow'));seen.add('nosy-calendar-hover-width');
  check(parseFloat(await cssValue(meeting,'outline-width'))===4,'focus width applies');seen.add('nosy-calendar-focus-width');
  check((await cssValue(meeting,'box-shadow')).includes(rgb(custom['nosy-calendar@@nosy-calendar-hover@@dark'])),'hover ring color applies');colorSeen.add(prefix+'hover');
  check(await cssValue(meeting,'outline-color')===rgb(custom['nosy-calendar@@nosy-calendar-focus@@dark']),'focus ring color applies');colorSeen.add(prefix+'focus');
  check(colorSeen.size===colors.length,'all themed color targets exercised: '+colors.filter(c=>!colorSeen.has(c.id)).map(c=>c.id));
  const missing=numeric.filter(c=>!seen.has(c.id)).map(c=>c.id);check(missing.length===0,'all practical numeric controls exercised: '+missing.join(', '));
  const beforeDisabled=await evaluate('nosyHarness.snapshot()');
  await command(`document.getElementById('css-settings-manager').remove();document.body.classList.remove('css-settings-manager');await nosyHarness.frame();`);
  check(parseFloat(await cssValue('.nosy-event .fc-event-title','font-size'))===13,'disabled Style Settings restores usable defaults');
  check((await evaluate('nosyHarness.snapshot()')).period===beforeDisabled.period,'disabled Style Settings retains period');
  await apply(sized);check(parseFloat(await cssValue('.nosy-event .fc-event-title','font-size'))===16,'re-enabled preferences apply live');
  await apply({});await evaluate(`document.body.classList.replace('theme-dark','theme-light');nosyHarness.frame()`);
  await evaluate(`document.activeElement?.blur()`);await mouse('mouseMoved',1200,950);await mouse('mousePressed',1200,950);await mouse('mouseReleased',1200,950);await evaluate('nosyHarness.frame()');
  await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(result=>writeFile('.test-build/iteration07-week.png',Buffer.from(result.data,'base64')));
  for(const mode of ['dayGridMonth','multiMonthYear']){
    await evaluate(`nosyHarness.mode('${mode}')`);
    await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(result=>writeFile(`.test-build/iteration07-${mode}.png`,Buffer.from(result.data,'base64')));
  }
  const cleanup=await evaluate('nosyHarness.close()');check(cleanup.styleListeners===0&&cleanup.cacheListeners===0,'lifecycle removes external listeners');
  check(pageErrors.length===0,'no browser runtime errors: '+pageErrors.join('; '));
  await writeFile('.test-build/browser-results-07.json',JSON.stringify({checks,numericControls:seen.size,themedColors:colorSeen.size,installedStyleSettings:'1.0.9',browser:path.basename(executable),notesWrites:'only explicit tested gestures',passed:true},null,2));
  console.log(`Headless browser passed ${checks} checks, including ${seen.size} live numeric controls, style precedence, ISO periods and physical drag/resize/click.`);
}finally{
  palette.close();if(socket?.readyState===WebSocket.OPEN){try{await cdp('Browser.close',{},null)}catch{}socket.close();}browser.kill();for(const p of pending.values())clearTimeout(p.timer);
}
