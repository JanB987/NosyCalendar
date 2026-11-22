import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { Calendar } from '@fullcalendar/core';
import { StyleLayout } from '../src/style-layout';
const dom=new JSDOM('<head></head><body></body>',{pretendToBeVisual:true});
globalThis.MutationObserver=dom.window.MutationObserver;
after(()=>dom.window.close());
const frame=()=>new Promise<void>(resolve=>dom.window.requestAnimationFrame(()=>dom.window.requestAnimationFrame(()=>resolve())));
function fixture(){
  const root=dom.window.document.createElement('div');dom.window.document.body.append(root);
  Object.defineProperty(root,'clientWidth',{value:800});Object.defineProperty(root,'clientHeight',{value:600});
  const settings:Record<string,string>={};let busy=false,updates=0;
  const original=dom.window.getComputedStyle;
  dom.window.getComputedStyle=(()=>({getPropertyValue:(key:string)=>root.style.getPropertyValue(key)||settings[key]||''})) as unknown as typeof original;
  const options:Record<string,unknown>={eventMinHeight:28,multiMonthMinWidth:240};
  const calendar={getOption:(key:string)=>options[key],setOption:(key:string,value:unknown)=>{options[key]=value},batchRendering:(cb:()=>void)=>cb(),updateSize:()=>{updates++}} as unknown as Calendar;
  const layout=new StyleLayout(root,calendar,()=>busy);
  return {root,settings,options,layout,setBusy:(value:boolean)=>{busy=value},updates:()=>updates,close:()=>{layout.dispose();root.remove();dom.window.getComputedStyle=original;}};
}
test('live typography and spacing updates use public calendar sizing options without replacing a view or writing configuration',async()=>{
  const f=fixture();try{
    await frame();const initial=f.updates();
    f.options.slotDuration={minutes:15};
    f.settings['--nosy-calendar-event-min-height']='44px';f.settings['--nosy-calendar-year-min-width']='320px';f.layout.request();f.layout.request();await frame();
    assert.equal(f.options.eventMinHeight,44);assert.equal(f.options.multiMonthMinWidth,320);assert.equal(f.updates(),initial+1);
    assert.deepEqual(f.options.slotDuration,{minutes:15},'refresh preserves the configured slot duration');
    f.layout.request();await frame();assert.equal(f.updates(),initial+1,'unchanged styles do not cause layout loops');
  }finally{f.close();}
});
test('gesture freeze covers the root, mounted previews and floating clones; release applies deferred geometry',async()=>{
  const f=fixture();try{
    await frame();const event=dom.window.document.createElement('div');f.root.append(event);f.layout.mount(event);
    f.setBusy(true);f.layout.freeze([event]);
    const clone=event.cloneNode() as HTMLElement;dom.window.document.body.append(clone);
    const preview=dom.window.document.createElement('div');f.root.append(preview);f.layout.mount(preview);
    f.settings['--nosy-calendar-event-min-height']='52px';f.settings['--nosy-calendar-event-title-size']='22px';f.layout.request();await frame();
    assert.equal(f.options.eventMinHeight,28);assert.equal(event.style.getPropertyValue('--nosy-calendar-event-title-size'),'13px');
    assert.equal(preview.style.getPropertyValue('--nosy-calendar-event-title-size'),'13px');assert.equal(clone.style.getPropertyValue('--nosy-calendar-event-title-size'),'13px');
    f.setBusy(false);f.layout.release();await frame();assert.equal(f.options.eventMinHeight,52);
    assert.equal(clone.style.getPropertyValue('--nosy-calendar-event-title-size'),'');assert.equal(f.root.style.getPropertyValue('--nosy-calendar-event-title-size'),'');clone.remove();
  }finally{f.close();}
});
test('style watcher teardown disconnects mutations and cancels pending layout callbacks',async()=>{
  const f=fixture();await frame();const count=f.updates();f.layout.request();f.close();
  dom.window.document.body.classList.toggle('theme-dark');await frame();assert.equal(f.updates(),count);
});
