/**
 * The icon set, as semantic name -> Google Material Symbol name.
 *
 * This file is the single source of truth for which icons exist in the app.
 * `build-icons.mjs` reads it, pulls the matching artwork out of
 * `@material-symbols/svg-400`, and generates `lib/icons.generated.ts` with the
 * path data for exactly these and nothing else.
 *
 * The alternative — shipping the Material Symbols variable font — costs 3.9 MB
 * for the outlined set alone, which is larger than the rest of the site put
 * together and would undo the loading work the whole product depends on.
 * Inlining the sixty-odd icons actually used costs a few kilobytes, needs no
 * font loading, no FOUT and no ligature lookup, and lets every icon inherit
 * `currentColor`.
 *
 * Adding an icon: add a line here and the type in `Icon.tsx` picks it up. A
 * name that does not exist in the package fails the build rather than
 * rendering an empty box.
 */
export const ICONS = {
  // --- affordances
  chevronDown: 'keyboard_arrow_down',
  chevronUp: 'keyboard_arrow_up',
  chevronLeft: 'keyboard_arrow_left',
  chevronRight: 'keyboard_arrow_right',
  arrowUp: 'arrow_upward',
  arrowDown: 'arrow_downward',
  arrowForward: 'arrow_forward',
  arrowBack: 'arrow_back',
  close: 'close',
  check: 'check',
  add: 'add',
  remove: 'remove',
  search: 'search',
  more: 'more_horiz',
  drag: 'drag_indicator',
  expand: 'open_in_full',
  collapse: 'close_fullscreen',
  refresh: 'refresh',
  undo: 'undo',
  redo: 'redo',
  zoomIn: 'zoom_in',
  zoomOut: 'zoom_out',
  visible: 'visibility',
  hidden: 'visibility_off',
  lock: 'lock',
  info: 'info',
  warning: 'warning',
  error: 'error',
  help: 'help',
  settings: 'tune',
  palette: 'palette',
  calendar: 'calendar_month',
  save: 'save',
  copy: 'content_copy',
  download: 'download',
  upload: 'upload',
  print: 'print',
  delete: 'delete',
  edit: 'edit',
  filter: 'filter_alt',
  sort: 'swap_vert',
  functions: 'functions',
  lightMode: 'light_mode',
  darkMode: 'dark_mode',
  pin: 'keep',
  fullscreen: 'fullscreen',
  trendUp: 'trending_up',
  trendDown: 'trending_down',
  trendFlat: 'trending_flat',

  // --- chart types
  chartBar: 'bar_chart',
  chartColumn: 'bar_chart_4_bars',
  chartLine: 'show_chart',
  chartArea: 'area_chart',
  chartPie: 'pie_chart',
  chartDonut: 'donut_large',
  chartRadar: 'radar',
  chartScatter: 'scatter_plot',
  chartBubble: 'bubble_chart',
  chartHeatmap: 'grid_on',
  chartTreemap: 'account_tree',
  chartCandlestick: 'candlestick_chart',
  chartGauge: 'speed',
  chartTimeline: 'timeline',
  chartFunnel: 'filter_alt',
  chartBox: 'align_justify_space_even',
  chartPolar: 'data_usage',
  chartWaterfall: 'waterfall_chart',
  chartStacked: 'stacked_bar_chart',
  chartSpark: 'ssid_chart',
  table: 'table_chart',
  pivot: 'pivot_table_chart',

  // --- tools
  toolMerge: 'merge',
  toolSplit: 'call_split',
  toolOrganize: 'low_priority',
  toolCompress: 'compress',
  toolImagesToPdf: 'picture_as_pdf',
  toolPdfToImages: 'image',
  toolExcelToPdf: 'grid_on',
  toolPdfToExcel: 'table_view',
  toolEditPdf: 'edit_document',
  toolWatermark: 'branding_watermark',
  toolPageNumbers: 'format_list_numbered',
  toolRemoveWatermark: 'layers_clear',
  toolOptimizeSvg: 'wand_stars',
  toolFavicon: 'tab',
  toolRemoveBackground: 'background_replace',
  toolUpscale: 'photo_size_select_large',
  toolRemoveObject: 'ink_eraser',
  toolResize: 'aspect_ratio',
  toolConvert: 'sync_alt',
  toolCrop: 'crop',
  toolRecord: 'screen_record',
  toolResume: 'contact_page',
  toolQr: 'qr_code_2',
  toolReport: 'lab_profile',
  toolDashboard: 'dashboard',

  // --- categories
  catPdf: 'picture_as_pdf',
  catSvg: 'polyline',
  catImage: 'image',
  catRecord: 'videocam',
  catCreate: 'design_services',
  catData: 'analytics',
};
