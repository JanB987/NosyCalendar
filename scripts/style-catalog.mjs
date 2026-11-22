// Build-time catalog only: community Style Settings owns all user preferences.
export const prefix = 'nosy-calendar-';
const root = '.nosy-calendar';
const fc = '.nosy-calendar .fc';
export const groups = [
  ['toolbar', 'Toolbar', [
    ['title-size','Period title size',`${fc} .fc-toolbar-title`,'font-size',18,12,32,'px'],
    ['title-weight','Period title weight',`${fc} .fc-toolbar-title`,'font-weight',600,300,800,'',100],
    ['button-size','Button text size',`${fc} .fc-button`,'font-size',12,10,22,'px'],
    ['button-weight','Button text weight',`${fc} .fc-button`,'font-weight',500,300,800,'',100],
    ['toolbar-border-width','Button border width',`${fc} .fc-button`,'border-width',1,0,4,'px'],
    ['toolbar-radius','Button radius',`${fc} .fc-button`,'border-radius',6,0,18,'px'],
    ['toolbar-pad-x','Button horizontal padding',`${fc} .fc-button`,'padding-inline',9,4,24,'px'],
    ['toolbar-pad-y','Button vertical padding',`${fc} .fc-button`,'padding-block',5,2,16,'px'],
    ['toolbar-gap','Toolbar gaps',`${fc} .fc-toolbar, ${fc} .fc-toolbar-chunk`,'gap',8,2,28,'px']
  ], [
    ['toolbar-fg','Title and button text','var(--text-normal, #222)','#303030','#ddd'],
    ['toolbar-bg','Button background','var(--interactive-normal, #eee)','#eeeeee','#303030'],
    ['toolbar-border','Button border','var(--background-modifier-border, #ddd)','#d7d7d7','#444444']
  ]],
  ['header', 'Top weekday/date header', [
    ['weekday-size','Weekday text size',`${fc} .nosy-weekday`,'font-size',11,9,22,'px'],
    ['weekday-weight','Weekday text weight',`${fc} .nosy-weekday`,'font-weight',500,300,800,'',100],
    ['header-date-size','Header date size',`${fc} .nosy-header-date`,'font-size',13,10,26,'px'],
    ['header-date-weight','Header date weight',`${fc} .nosy-header-date`,'font-weight',600,300,800,'',100],
    ['header-padding','Header vertical padding',`${fc} .fc-col-header-cell-cushion`,'padding-block',8,2,24,'px'],
    ['header-separator-width','Header separator width',`${fc} .fc-col-header-cell`,'border-bottom-width',1,0,4,'px']
  ], [
    ['header-bg','Header background','var(--background-secondary, #f5f5f5)','#f5f5f5','#262626'],
    ['weekday-fg','Weekday text','var(--text-muted, #666)','#666666','#aaa'],
    ['header-date-fg','Header date text','var(--text-normal, #222)','#222222','#ddd'],
    ['header-separator','Header separator','var(--background-modifier-border, #ddd)','#dddddd','#444444']
  ]],
  ['dates', 'Calendar dates', [
    ['day-size','Day number size',`${fc} .fc-daygrid-day-number`,'font-size',12,9,24,'px'],
    ['day-weight','Day number weight',`${fc} .fc-daygrid-day-number`,'font-weight',500,300,800,'',100],
    ['month-title-size','Year month title size',`${fc} .fc-multimonth-title`,'font-size',15,11,28,'px'],
    ['month-title-weight','Year month title weight',`${fc} .fc-multimonth-title`,'font-weight',600,300,800,'',100]
  ], [
    ['day-fg','Day number text','var(--text-normal, #222)','#333333','#ddd'],
    ['today-fg','Today number text','var(--interactive-accent, #6750a4)','#6750a4','#b6a3ec'],
    ['outside-fg','Adjacent-month number text','var(--text-faint, #999)','#999999','#666666'],
    ['month-title-fg','Year month title text','var(--text-normal, #222)','#222222','#ddd']
  ]],
  ['grid', 'Grid and frame', [
    ['grid-horizontal-width','Horizontal grid width',`${fc} td, ${fc} th`,'border-top-width, border-bottom-width',1,0,4,'px'],
    ['grid-vertical-width','Vertical grid width',`${fc} td, ${fc} th`,'border-left-width, border-right-width',1,0,4,'px'],
    ['minor-line-width','Minor time-line width',`${fc} .fc-timegrid-slot-minor`,'border-top-width',1,0,4,'px'],
    ['major-line-width','Major time-line width',`${fc} .fc-timegrid-slot:not(.fc-timegrid-slot-minor)`,'border-top-width',1,0,5,'px'],
    ['day-separator-width','Time-grid day separator width',`${fc} .fc-timegrid-col`,'border-left-width, border-right-width',1,0,5,'px'],
    ['frame-width','Outer frame width',`${fc} .fc-scrollgrid, ${fc} .fc-multimonth`,'border-width',1,0,5,'px']
  ], [
    ['grid-horizontal','Horizontal grid lines','var(--background-modifier-border, #ddd)','#dddddd','#3b3b3b'],
    ['grid-vertical','Vertical grid lines','var(--background-modifier-border, #ddd)','#dddddd','#3b3b3b'],
    ['minor-line','Minor time lines','color-mix(in srgb, var(--background-modifier-border, #ddd) 45%, transparent)','#eeeeee','#2d2d2d'],
    ['major-line','Major time lines','var(--background-modifier-border, #ddd)','#d7d7d7','#404040'],
    ['day-separator','Time-grid day separators','var(--background-modifier-border, #ddd)','#dddddd','#444444'],
    ['frame','Outer frame','var(--background-modifier-border, #ddd)','#d7d7d7','#444444']
  ]],
  ['events', 'Events', [
    ['event-title-size','Event title size','.nosy-event .fc-event-title','font-size',13,10,24,'px'],
    ['event-title-weight','Event title weight','.nosy-event .fc-event-title','font-weight',500,300,800,'',100],
    ['event-time-size','Event time size','.nosy-event .nosy-event-time','font-size',11,9,22,'px'],
    ['event-time-weight','Event time weight','.nosy-event .nosy-event-time','font-weight',500,300,800,'',100],
    ['event-padding-x','Event horizontal padding','.nosy-event .fc-event-main','padding-inline',7,2,20,'px'],
    ['event-padding-y','Event vertical padding','.nosy-event .fc-event-main','padding-block',3,0,14,'px'],
    ['event-line-height','Event line height','.nosy-event .fc-event-main','line-height',1.25,1,2,'',0.05],
    ['event-min-height','Minimum event height',`${fc} .fc-h-event.nosy-event`,'min-height',28,24,80,'px'],
    ['event-gap','Space between day-grid events',`${fc} .fc-daygrid-event.nosy-event`,'margin-bottom',3,0,16,'px'],
    ['event-radius','Event corner radius','.nosy-event','border-radius',5,0,18,'px'],
    ['event-edge-width','Event edge thickness','.nosy-event.fc-event','border-width',1,0,6,'px']
  ], [
    ['event-fill','Fallback fill (rules override)','var(--interactive-accent, #6750a4)','#6750a4','#8065bf'],
    ['event-edge','Fallback edge (roles override)','var(--interactive-accent, #6750a4)','#6750a4','#8065bf'],
    ['event-text','Fallback text (rule contrast overrides)','var(--text-on-accent, #fff)','#ffffff','#ffffff']
  ]],
  ['badges', 'Role badges', [
    ['badge-size','Role badge text size','.nosy-role-label','font-size',10,8,20,'px'],
    ['badge-weight','Role badge text weight','.nosy-role-label','font-weight',500,300,800,'',100],
    ['badge-padding-x','Badge horizontal padding','.nosy-role-label','padding-inline',4,1,14,'px'],
    ['badge-padding-y','Badge vertical padding','.nosy-role-label','padding-block',0,0,8,'px'],
    ['badge-border-width','Badge border width','.nosy-role-label','border-width',1,0,4,'px'],
    ['badge-radius','Badge corner radius','.nosy-role-label','border-radius',4,0,14,'px'],
    ['badge-offset','Badge vertical offset','.nosy-role-label','--nc-badge-offset',-6,-16,6,'px']
  ], [
    ['badge-fg','Badge text','var(--text-normal, #222)','#333333','#ddd'],
    ['badge-bg','Badge background','var(--background-primary, #fff)','#ffffff','#202020']
  ]],
  ['axis', 'Time / all-day axis', [
    ['axis-size','Time label size',`${fc} .fc-timegrid-slot-label-cushion`,'font-size',11,9,22,'px'],
    ['axis-weight','Time label weight',`${fc} .fc-timegrid-slot-label-cushion`,'font-weight',400,300,800,'',100],
    ['all-day-size','All-day label size',`${fc} .fc-timegrid-axis-cushion`,'font-size',11,9,22,'px'],
    ['all-day-weight','All-day label weight',`${fc} .fc-timegrid-axis-cushion`,'font-weight',500,300,800,'',100],
    ['axis-width','Axis label minimum width',`${fc} .fc-timegrid-axis-cushion, ${fc} .fc-timegrid-slot-label-cushion`,'min-width',60,40,140,'px']
  ], [
    ['axis-fg','Time label text','var(--text-muted, #666)','#666666','#aaa'],
    ['axis-bg','Time axis background','var(--background-primary, #fff)','#ffffff','#202020'],
    ['all-day-fg','All-day label text','var(--text-muted, #666)','#666666','#aaa'],
    ['all-day-bg','All-day axis background','var(--background-secondary, #f5f5f5)','#f5f5f5','#262626']
  ]],
  ['highlights', 'Highlights', [
    ['now-width','Now-line thickness',`${fc} .fc-timegrid-now-indicator-line`,'border-top-width',2,1,6,'px'],
    ['hover-width','Hover ring thickness','.nosy-event:hover','--nc-hover-width',1,0,4,'px'],
    ['focus-width','Keyboard focus ring thickness',`${root} .nosy-event:focus-visible`,'outline-width',2,1,6,'px']
  ], [
    ['today-bg','Today surface','color-mix(in srgb, var(--interactive-accent, #6750a4) 7%, var(--background-primary, #fff))','#f4f0fc','#2c2638'],
    ['weekend-bg','Weekend surface','color-mix(in srgb, var(--background-secondary, #eee) 45%, var(--background-primary, #fff))','#fafafa','#222222'],
    ['outside-bg','Adjacent-month surface','var(--background-secondary, #f5f5f5)','#f5f5f5','#262626'],
    ['now','Now indicator','var(--color-red, #d94d4d)','#d94d4d','#ec7777'],
    ['hover','Event hover ring','var(--text-muted, #888)','#888888','#aaa'],
    ['focus','Keyboard focus ring','var(--interactive-accent, #6750a4)','#6750a4','#b6a3ec']
  ]],
  ['weeks', 'Week indicators', [
    ['week-size','Top ISO indicator text size',`${fc} .nosy-iso-indicator`,'font-size',11,9,22,'px'],
    ['week-weight','Top ISO indicator weight',`${fc} .nosy-iso-indicator`,'font-weight',500,300,800,'',100],
    ['week-padding','Top ISO indicator padding',`${fc} .nosy-iso-indicator`,'padding',4,0,14,'px'],
    ['week-gap','Space beside period title',`${fc} .nosy-heading`,'gap',8,2,24,'px'],
    ['week-border-width','Top ISO indicator border width',`${fc} .nosy-iso-indicator`,'border-width',1,0,4,'px'],
    ['week-row-size','Row week-number text size',`${fc} .fc-daygrid-week-number`,'font-size',10,8,20,'px'],
    ['week-row-weight','Row week-number text weight',`${fc} .fc-daygrid-week-number`,'font-weight',500,300,800,'',100],
    ['week-row-padding','Row week-number padding',`${fc} .fc-daygrid-week-number`,'padding',3,1,10,'px']
  ], [
    ['week-fg','Top ISO indicator text','var(--text-muted, #666)','#666666','#aaa'],
    ['week-bg','Top ISO indicator background','var(--background-secondary, #f5f5f5)','#f5f5f5','#262626'],
    ['week-border','Top ISO indicator border','var(--background-modifier-border, #ddd)','#dddddd','#444444'],
    ['week-row-fg','Row week-number text','var(--text-muted, #666)','#777777','#aaa'],
    ['week-row-bg','Row week-number background','var(--background-secondary, #f5f5f5)','#f5f5f5','#262626']
  ]],
  ['layout', 'Layout and overflow', [
    ['outer-padding','Calendar outer padding',root,'padding',10,0,30,'px'],
    ['slot-height','Minimum half-hour slot height',`${fc} .fc-timegrid-slot`,'height',28,18,72,'px'],
    ['day-min-height','Day-cell minimum height (Month / Year)',`${fc} .fc-daygrid-day-frame`,'min-height',24,16,180,'px'],
    ['year-gap','Year month spacing (padding per month)',`${fc} .fc-multimonth-month`,'padding',6,0,24,'px'],
    ['year-min-width','Year month minimum width',`${fc} .fc-multimonth-month`,'min-width',240,200,520,'px'],
    ['overflow-size','More-link and popover text size',`${fc} .fc-more-link, ${fc} .fc-popover`,'font-size',12,10,24,'px'],
    ['popover-padding','Popover padding',`${fc} .fc-popover-body`,'padding',10,4,28,'px'],
    ['popover-gap','Popover event spacing',`${fc} .fc-popover .fc-daygrid-event`,'margin-bottom',6,1,24,'px'],
    ['popover-border-width','Popover border width',`${fc} .fc-popover`,'border-width',1,0,5,'px']
  ], [
    ['overflow-fg','More-link and popover text','var(--text-normal, #222)','#333333','#ddd'],
    ['popover-bg','Popover surface','var(--background-primary, #fff)','#ffffff','#202020'],
    ['popover-border','Popover border','var(--background-modifier-border, #ddd)','#dddddd','#444444']
  ]]
];

export const numeric = groups.flatMap(([, , controls]) => controls.map(([key,title,selector,property,value,min,max,format,step=1]) => ({
  id: prefix+key, title, selector, property, type: 'variable-number-slider', default: value, min, max, step, ...(format ? {format} : {})
})));
export const colors = groups.flatMap(([group,,, colors]) => colors.map(([key,title,theme,light,dark]) => ({
  id: prefix+key, group, title, theme, type: 'variable-themed-color', format: 'hex', 'default-light':light, 'default-dark':dark
})));
export const settings = groups.flatMap(([group,title,controls,groupColors]) => [
  {id:prefix+group, title, type:'heading', level:1, collapsed:true},
  ...numeric.filter(control=>controls.some(([key])=>prefix+key===control.id)).map(({selector,property,...metadata})=>metadata),
  {id:prefix+group+'-colors',title:'Colors: Theme / Custom',type:'class-select',allowEmpty:false,default:prefix+group+'-theme',
    description:'Theme follows Obsidian. Custom uses the light/dark pickers below. Use the reset button to restore defaults.',
    options:[{label:'Theme',value:prefix+group+'-theme'},{label:'Custom',value:prefix+group+'-custom'}]},
  ...colors.filter(control=>groupColors.some(([key])=>prefix+key===control.id)).map(({group,theme,...metadata})=>metadata)
]);
