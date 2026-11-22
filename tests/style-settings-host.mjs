import { readFileSync } from 'node:fs';
import { runInContext, createContext } from 'node:vm';
import { JSDOM } from 'jsdom';
export const installed = new URL('../.test-build/fixtures/style-settings/', import.meta.url);

/** Read-only compatibility harness. No Obsidian, plugin onload or real settings writes are invoked. */
export function styleSettingsHost() {
  const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://localhost/' });
  const win = dom.window, Base = class {};
  const obsidian = new Proxy({ Plugin:Base, PluginSettingTab:Base, ItemView:Base, Setting:Base, Component:Base, Modal:Base }, {get:(object,key)=>object[key]??Base});
  const context = createContext({ module:{exports:{}}, exports:{}, require:()=>obsidian, console, window:win, self:win,
    localStorage:win.localStorage, document:win.document, navigator:win.navigator, setTimeout, clearTimeout, HTMLElement:win.HTMLElement });
  runInContext(readFileSync(new URL('main.js', installed),'utf8'), context);
  const Plugin = context.module.exports.default;
  const parser = Object.create(Plugin.prototype); parser.settingsList = []; parser.errorList = [];
  parser.parseCSSStyleSheet({ownerNode:{textContent:readFileSync('styles.css','utf8')}});
  if (parser.errorList.length || parser.settingsList.length !== 1) throw new Error('Installed Style Settings parser rejected metadata.');
  const config = parser.settingsList[0];
  const Manager = runInContext('Jt', context);
  const manager = new Manager({app:{workspace:{trigger(){}}},saveData:async()=>{},getCSSVar:()=>({light:'',dark:'',current:''})});
  const apply = settings => {
    manager.removeClasses(); manager.settings = settings; manager.setConfig([config]); manager.initClasses();
    return {css:manager.styleTag.innerText,classes:[...win.document.body.classList]};
  };
  return {config, apply, close:()=>dom.window.close()};
}
