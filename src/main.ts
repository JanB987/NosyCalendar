import { Notice, Plugin } from 'obsidian';
import { NosyCalendarView, VIEW_TYPE } from './view';
import { SerialSaves } from './writeback';

export default class NosyCalendarPlugin extends Plugin {
  onload(): void {
    // Documented community Style Settings discovery hook; harmless when it is absent.
    this.app.workspace.trigger('parse-style-settings');
    if (typeof this.registerBasesView !== 'function') {
      new Notice('NosyCalendar requires Obsidian 1.10.0 or later with the Bases core plugin enabled.');
      return;
    }
    const views = new Set<NosyCalendarView>();
    const saves = new SerialSaves();
    this.register(() => {
      for (const view of views) view.unload();
      views.clear();
    });
    const registered = this.registerBasesView(VIEW_TYPE, {
      name: 'NosyCalendar',
      icon: 'calendar-days',
      factory: (controller, containerEl) => {
        const view = new NosyCalendarView(controller, containerEl, () => views.delete(view), saves);
        views.add(view);
        return view;
      }
    });
    if (!registered) new Notice('NosyCalendar could not register its layout. Enable the Bases core plugin, then reload NosyCalendar.');
  }
}
