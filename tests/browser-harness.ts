import { TFile, StringValue, NullValue, type App, type BasesEntry, type BasesQueryResult, type BasesViewConfig, type QueryController } from 'obsidian';
import { NosyCalendarView } from '../src/view';
import { SerialSaves } from '../src/writeback';
import { ROLES_KEY } from '../src/roles';
import { COLORS_KEY } from '../src/colors';
import type { Calendar } from '@fullcalendar/core';

const host = document.createElement('div'); host.id='calendar-test'; host.style.cssText='height:850px;width:1100px;max-width:100%;';document.body.append(host);
const notes = [
  {name:'Meeting',scheduled:'2026-11-23T09:00',until:'2026-11-23T10:00',status:'Waiting',check:'2026-11-24T14:00',checkEnd:'2026-11-24T14:30'},
  {name:'Short',scheduled:'2026-11-23T09:30',until:'2026-11-23T09:35',status:'Other',fallback:'2026-11-23T16:00'},
  {name:'All day',scheduled:'2026-11-23',until:'2026-11-23',status:'Waiting'},
  ...Array.from({length:4},(_,i)=>({name:`Overflow ${i}`,scheduled:'2026-11-23',until:'2026-11-23',status:'Other'}))
].map(note=>({file:Object.assign(new TFile(),{path:note.name+'.md',basename:note.name,extension:'md'}),fm:{...note} as Record<string,unknown>}));
let writes=0, opens=0, empty=false;
const cacheListeners = new Set<(file:TFile)=>void>(), styleListeners = new Set<()=>void>();
const config: Record<string,unknown> = {
  [ROLES_KEY]: [
    {id:'scheduled',label:'Scheduled',startProperty:'note.scheduled',endProperty:'note.until',edgeColor:'#325cff',rollPastDates:false},
    {id:'check',label:'Check',startProperty:'note.check',endProperty:'note.checkEnd',edgeColor:'#d93b54',rollPastDates:false},
    {id:'fallback',label:'Fallback',startProperty:'note.fallback',endProperty:null,edgeColor:null,rollPastDates:false}
  ], [COLORS_KEY]: [{id:'waiting',property:'note.status',operator:'=',operand:{type:'text',value:'Waiting'},color:'#fbd1d9'}]
};
const app = {
  vault:{getMarkdownFiles:()=>notes.map(n=>n.file),getAbstractFileByPath:(path:string)=>notes.find(n=>n.file.path===path)?.file??null},
  metadataCache:{getFileCache:(file:TFile)=>({frontmatter:notes.find(n=>n.file===file)!.fm}),on:(_name:string,fn:(file:TFile)=>void)=>{cacheListeners.add(fn);return fn;},offref:(fn:(file:TFile)=>void)=>cacheListeners.delete(fn)},
  workspace:{on:(_name:string,fn:()=>void)=>{styleListeners.add(fn);return fn;},offref:(fn:()=>void)=>styleListeners.delete(fn),getLeaf:()=>({openFile:async()=>{opens++;}})},
  fileManager:{processFrontMatter:async(file:TFile,callback:(fm:Record<string,unknown>)=>void)=>{const note=notes.find(n=>n.file===file)!;const draft={...note.fm};callback(draft);Object.assign(note.fm,draft);writes++;for(const fn of cacheListeners)fn(file);setData();view.onDataUpdated();}}
} as unknown as App;
const view=new NosyCalendarView({app} as unknown as QueryController,host,()=>{},new SerialSaves(),()=>new Date(2026,10,23,12));
view.config={get:(key:string)=>config[key],getAsPropertyId:()=>null,set:(key:string,value:unknown)=>{config[key]=value;view.onDataUpdated();}} as unknown as BasesViewConfig;
const setData=()=>{view.data={data:empty?[]:notes.map(note=>{const fm={...note.fm};return {file:note.file,getValue:(property:string)=>typeof fm[property.slice(5)]==='string'?new StringValue(fm[property.slice(5)] as string):NullValue.value};})} as unknown as BasesQueryResult;};
setData();view.onload();
const calendar=(view as unknown as {calendar:Calendar}).calendar;
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
Object.assign(window,{nosyHarness:{calendar,view,host,notes,config,frame,
  async mode(mode:string,date='2026-11-23'){calendar.changeView(mode,date);await frame();},
  async style(css:string,classes:string[]=[]){let el=document.getElementById('css-settings-manager');if(!el){el=document.createElement('style');el.id='css-settings-manager';document.head.append(el);}el.textContent=css;for(const c of [...document.body.classList])if(c.startsWith('nosy-calendar-'))document.body.classList.remove(c);document.body.classList.add('css-settings-manager',...classes);for(const fn of styleListeners)fn();await frame();},
  async empty(value:boolean){empty=value;setData();view.onDataUpdated();await frame();},
  snapshot(){return {writes,opens,notes:JSON.stringify(notes.map(n=>n.fm)),config:JSON.stringify(config),period:calendar.getDate().toISOString(),mode:calendar.view.type,events:calendar.getEvents().map(e=>({title:e.title,start:e.startStr,end:e.endStr,allDay:e.allDay}))};},
  close(){view.unload();return {styleListeners:styleListeners.size,cacheListeners:cacheListeners.size};}
}});
