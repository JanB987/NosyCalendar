import { readFile } from 'node:fs/promises';

export async function generateNotices() {
  const read = async file => (await readFile(file, 'utf8')).replace(/\r\n/g, '\n').trim();
  let notices = `NosyCalendar - project and bundled dependency licenses\n\nNosyCalendar\n${await read('LICENSE')}\n\n`;
  for (const name of ['@fullcalendar/core', '@fullcalendar/daygrid', '@fullcalendar/timegrid', '@fullcalendar/multimonth', '@fullcalendar/interaction', 'preact']) {
    const metadata = JSON.parse(await read(`node_modules/${name}/package.json`));
    const license = await read(`node_modules/${name}/${name === 'preact' ? 'LICENSE' : 'LICENSE.md'}`);
    notices += `${name} ${metadata.version}\n${metadata.copyright ?? ''}\n${license}\n\n`;
  }
  return notices.trimEnd() + '\n';
}
