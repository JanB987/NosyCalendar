import { existsSync } from 'node:fs';
import path from 'node:path';

export function browserExecutable() {
  const configured = process.env.BROWSER_EXECUTABLE;
  if (configured) {
    if (!existsSync(configured)) throw new Error(`BROWSER_EXECUTABLE does not exist: ${configured}`);
    return configured;
  }
  const candidates = process.platform === 'win32' ? [
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error('Install Chrome/Chromium/Edge and set BROWSER_EXECUTABLE to its absolute executable path. Browser checks are required.');
  return found;
}
