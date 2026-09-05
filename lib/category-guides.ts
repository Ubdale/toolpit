/**
 * The editorial half of a category page.
 *
 * A grid of tool cards tells a visitor what exists; it does not help someone
 * who does not yet know which of twelve PDF tools solves their problem, and it
 * gives a search engine almost nothing to read. Each category therefore carries
 * a chooser that maps a situation onto a tool, a few explainers about the
 * formats and trade-offs involved, and the questions people actually arrive
 * with.
 *
 * Written to be worth reading on its own. Anything here that is only padding
 * should be deleted rather than reworded.
 */

import type { CategoryId } from './tools';

export type ChooserRow = {
  /** The situation, in the visitor's words. */
  need: string;
  /** The tool that solves it. */
  href: string;
  label: string;
  /** Why that one, when a neighbouring tool looks similar. */
  why: string;
};

export type Explainer = {
  heading: string;
  body: string;
};

export type CategoryGuide = {
  /** Heading above the chooser table. */
  chooserHeading: string;
  chooser: ChooserRow[];
  sections: Explainer[];
  faqs: { question: string; answer: string }[];
};

export const categoryGuides: Record<CategoryId, CategoryGuide> = {
  // ------------------------------------------------------------------- PDF
  pdf: {
    chooserHeading: 'Which PDF tool do you need?',
    chooser: [
      {
        need: 'Several PDFs that should be one document',
        href: '/pdf/merge',
        label: 'Merge PDF',
        why: 'Keeps every page as it was. Use Reorder & rotate afterwards if the order needs work.',
      },
      {
        need: 'One PDF that should be several, or just a few pages out of it',
        href: '/pdf/split',
        label: 'Split PDF',
        why: 'Pulls out page ranges. If you only want to move pages around, Reorder is the lighter job.',
      },
      {
        need: 'Pages upside down, out of order, or one page that must go',
        href: '/pdf/organize',
        label: 'Reorder & rotate',
        why: 'A visual page grid. Nothing is re-encoded, so the text and images stay exactly as they were.',
      },
      {
        need: 'A file too large to email',
        href: '/pdf/compress',
        label: 'Compress PDF',
        why: 'Recompresses the images, which is where nearly all the weight in a big PDF actually sits.',
      },
      {
        need: 'The wording is wrong',
        href: '/pdf/edit',
        label: 'PDF editor',
        why: 'Edits the real text layer rather than pasting a white box over it, so the text stays selectable and searchable.',
      },
      {
        need: 'Numbers trapped in a PDF that belong in a spreadsheet',
        href: '/pdf/pdf-to-excel',
        label: 'PDF to Excel',
        why: 'Rebuilds rows and columns from the text layer. A scan with no text layer will not convert.',
      },
      {
        need: 'A draft that should be marked as one',
        href: '/pdf/watermark',
        label: 'Watermark PDF',
        why: 'Stamps text or a logo over every page. Remove watermark does the reverse.',
      },
    ],
    sections: [
      {
        heading: 'Why a PDF is large, and what actually shrinks it',
        body: 'Almost every oversized PDF is oversized for one reason: the images inside it are stored at far higher resolution than anything needs. A page scanned at 600 DPI carries roughly four times the pixels of the same page at 300 DPI, and no screen or office printer will show the difference. Compression works on those images. It cannot do much for a text-only document, because text in a PDF is already stored as instructions to draw glyphs rather than as pixels — a hundred-page contract is often smaller than a single photograph. If a PDF is large and compressing it barely moves the number, the weight is usually embedded fonts or an attached file rather than anything an optimiser can reach.',
      },
      {
        heading: 'Text layers, scans, and why some PDFs cannot be edited',
        body: 'A PDF made by exporting from Word or Google Docs has a text layer: the characters are really there, and can be selected, searched, edited and converted to a spreadsheet. A PDF made by scanning paper is a picture of text. It looks identical on screen and behaves completely differently — nothing to select, nothing to search, nothing for a converter to read. If you cannot select a sentence with your cursor in any PDF viewer, no tool here can edit or extract that text, because there is no text to work with. Converting a scan requires OCR, which recognises shapes and guesses at characters, and it is a different job with a different failure mode.',
      },
      {
        heading: 'Page order without re-encoding',
        body: 'Merging, splitting, reordering, rotating and numbering all rewrite the structure of a PDF while leaving the page contents untouched, byte for byte. That matters more than it sounds: a document can go through all five operations and come out with its text still selectable, its fonts still embedded and its images at their original quality. Compression is the one operation in this category that genuinely alters what is on the page, which is why it is the only one with a quality setting.',
      },
    ],
    faqs: [
      {
        question: 'Will any of these break a signed or certified PDF?',
        answer: 'Yes, in the sense that a digital signature covers the exact bytes of the file it was applied to. Merging, splitting, compressing or editing produces a different file, so the signature no longer matches and viewers will report it as invalid. That is the signature doing its job. Apply signatures last, after every other change.',
      },
      {
        question: 'Is there a page or file size limit?',
        answer: 'Only your device. Nothing is uploaded, so there is no server quota to hit and no queue to wait in — the ceiling is how much memory your browser can give a single tab. A few hundred pages is routine on an ordinary laptop; several thousand very high-resolution scans at once may not be.',
      },
      {
        question: 'Do password-protected PDFs work?',
        answer: 'A PDF that opens without prompting you for a password will work. One that is encrypted has to be decrypted before anything can read its pages, and these tools do not attempt that — open it in a viewer with the password and re-save an unprotected copy first.',
      },
      {
        question: 'Why does the page look slightly different after compressing?',
        answer: 'Compression re-encodes images at a lower quality, and at aggressive settings that is visible in photographs, gradients and fine detail — as softness or faint blocking. Text is unaffected, because it is not stored as an image. Use a gentler setting for anything that will be printed rather than read on screen.',
      },
    ],
  },

  // ----------------------------------------------------------------- IMAGE
  image: {
    chooserHeading: 'Which image tool do you need?',
    chooser: [
      {
        need: 'A cut-out with no background',
        href: '/image/remove-background',
        label: 'Background remover',
        why: 'A segmentation model finds the subject. Export as PNG or WebP to keep transparency — JPG cannot store it.',
      },
      {
        need: 'A picture that is too small for how it will be used',
        href: '/image/upscale',
        label: 'Image upscaler',
        why: 'Reconstructs detail rather than smearing pixels the way plain resizing does.',
      },
      {
        need: 'Something in the frame that should not be',
        href: '/image/remove-object',
        label: 'Object removal',
        why: 'Brush over it and the gap is filled from the surrounding pixels.',
      },
      {
        need: 'An exact pixel size, or a whole folder at one size',
        href: '/image/resize',
        label: 'Resize image',
        why: 'Straight scaling, in bulk. Use the upscaler instead if you are going significantly larger.',
      },
      {
        need: 'The wrong file format',
        href: '/image/convert',
        label: 'Convert image',
        why: 'Moves between PNG, JPG, WebP and AVIF. See the format notes below before choosing.',
      },
      {
        need: 'The right size but the wrong framing',
        href: '/image/crop',
        label: 'Crop image',
        why: 'Trims to a ratio or an exact box. Cropping discards pixels; resizing keeps them all.',
      },
    ],
    sections: [
      {
        heading: 'Choosing a format: PNG, JPG, WebP or AVIF',
        body: 'JPG is for photographs and nothing else: it throws away detail your eye is unlikely to miss, which makes it small, and it cannot store transparency. PNG is lossless and handles transparency, which makes it right for logos, screenshots, diagrams and anything with flat colour or hard edges — and needlessly large for a photograph. WebP does both jobs and lands roughly 25-35% smaller than the equivalent JPG or PNG, with support in every current browser. AVIF is smaller again, sometimes dramatically so, at the cost of slower encoding and patchier support in older software. For the web, WebP is the safe default and AVIF the aggressive one. For a file someone else will open in an unknown program, PNG or JPG remains the least surprising choice.',
      },
      {
        heading: 'Why enlarging usually disappoints, and when it does not',
        body: 'Making an image larger means inventing pixels that were never captured. Ordinary resizing does this by averaging neighbours, which is why an enlarged photo looks soft — no new detail appears, the existing detail is simply spread over more pixels. An upscaling model does something different: it has seen a great many images and predicts what plausibly belongs in the gaps, so edges stay sharp and texture survives. It works well on photographs and on artwork with clean lines. It cannot recover something that was never in the file — a face that is thirty pixels across has no expression to restore, and no model can put one back.',
      },
      {
        heading: 'Resizing, cropping, and the difference that matters',
        body: 'Resizing keeps the whole picture and changes how many pixels describe it. Cropping keeps the pixels and throws away part of the picture. The distinction matters when something requires an exact aspect ratio: a square profile photo from a landscape original has to lose the sides, and no amount of resizing will do it without squashing faces. Do the crop first, to fix the composition, then resize to the pixel dimensions you need — that order avoids scaling detail you are about to discard.',
      },
    ],
    faqs: [
      {
        question: 'Do the AI tools send my photo anywhere?',
        answer: 'No. The model file is downloaded to your browser the first time you use one of those tools and cached for later visits, and it then runs on your own device. The download is the model coming to you, not your image going out — open your browser’s network panel while a tool runs and you will not see your file in any request.',
      },
      {
        question: 'Why is the first run of an AI tool slow?',
        answer: 'It downloads the model, which is tens of megabytes, and that happens once per browser. After that the model is served from cache and the only cost is the processing itself, which depends on your device and the size of the image.',
      },
      {
        question: 'Does converting to JPG lose quality every time?',
        answer: 'Yes. JPG is lossy, and each save discards a little more, so repeatedly editing and re-saving a JPG degrades it in a way that cannot be undone. Keep an original in PNG or in the format your camera produced, and export to JPG as the last step rather than as your working format.',
      },
      {
        question: 'Can I process a whole folder at once?',
        answer: 'Resize, convert and the watermark remover all take as many files as you like and apply the same settings across the set, then hand back a ZIP. There is no per-file charge or upload queue, so the practical limit is your device’s memory.',
      },
    ],
  },

  // ------------------------------------------------------------------- SVG
  svg: {
    chooserHeading: 'Which vector tool do you need?',
    chooser: [
      {
        need: 'An SVG that is far bigger than it should be',
        href: '/svg/optimize',
        label: 'SVG optimizer',
        why: 'Strips editor metadata and excess coordinate precision without changing how the file draws.',
      },
      {
        need: 'A favicon set for a website',
        href: '/svg/favicon-generator',
        label: 'Favicon generator',
        why: 'Produces every size browsers and devices ask for, plus the HTML to paste into your head.',
      },
    ],
    sections: [
      {
        heading: 'What makes an exported SVG so large',
        body: 'An SVG exported from Illustrator, Figma or Sketch is usually several times the size it needs to be, and almost none of that weight is the artwork. Design tools write out editor metadata, layer names, hidden objects, unused definitions, and coordinates carried to a dozen decimal places. A path point of 12.000000001 draws identically to 12 and costs eleven extra characters, repeated across every point in the file. Stripping that routinely halves an icon and can take far more off a complex illustration — with pixel-identical output, because nothing that affects rendering has been touched.',
      },
      {
        heading: 'Why a favicon is not one file any more',
        body: 'A favicon used to be a single ICO in the site root. It is now a small set: an SVG for browsers that accept one and render it crisply at any size, PNGs at several fixed sizes for those that do not, a 180px apple-touch-icon for iOS home screens, and a manifest entry with a maskable icon for Android, where the system crops your artwork to whatever shape the launcher uses. Missing the maskable version is the common mistake — Android will crop a normal icon to a circle and take the corners off your logo.',
      },
      {
        heading: 'Where SVG beats a raster file, and where it does not',
        body: 'SVG describes shapes rather than pixels, so it stays sharp at any size and usually weighs less than a PNG of the same logo. That makes it right for logos, icons, diagrams and charts. It is the wrong format for photographs: a photo has no shapes to describe, and any attempt to express one as vectors produces a file both larger and worse-looking than the JPG it came from. If the source is a photograph, it belongs in the image tools, not here.',
      },
    ],
    faqs: [
      {
        question: 'Will optimising change how my SVG looks?',
        answer: 'It should not. The optimiser removes information that does not affect rendering and rounds coordinates to a precision far finer than any display can resolve. If something does shift, it is nearly always because the file relied on editor-specific metadata that no renderer honoured anyway — compare before and after, which the tool shows side by side.',
      },
      {
        question: 'Is an SVG safe to put on my site?',
        answer: 'An SVG is a document, and it can contain scripts. That is a real consideration for files uploaded by other people, less so for your own artwork from a design tool. Optimising strips script and event-handler attributes as part of the cleanup, which is a useful side effect rather than a security guarantee.',
      },
      {
        question: 'What size should my favicon source be?',
        answer: 'Supply a square image at 512px or larger, or an SVG. Everything else is generated down from it. Keep the design simple: whatever you provide has to stay legible at 16px in a browser tab, where fine detail and small text disappear entirely.',
      },
    ],
  },

  // ---------------------------------------------------------------- CREATE
  create: {
    chooserHeading: 'Which builder do you need?',
    chooser: [
      {
        need: 'A CV that will survive an applicant tracking system',
        href: '/create/resume',
        label: 'Resume builder',
        why: 'Exports a PDF with a real text layer, so a parser reads words rather than a picture.',
      },
      {
        need: 'A chart from numbers you already have',
        href: '/create/chart',
        label: 'Chart maker',
        why: 'Paste a table, pick a type, export. The quickest route when the data is already tidy.',
      },
      {
        need: 'A chart from a spreadsheet, with control over the mapping',
        href: '/create/chart-builder',
        label: 'Chart builder',
        why: 'Drop in a file and choose which columns become axes, series and measures across 30 chart types.',
      },
      {
        need: 'A spreadsheet summarised, grouped or pivoted',
        href: '/create/report-builder',
        label: 'Report builder',
        why: 'Filters, groups, subtotals and pivots, then exports a real .xlsx that still recalculates.',
      },
      {
        need: 'A QR code for a poster, menu or label',
        href: '/create/qr-code',
        label: 'QR code generator',
        why: 'Encodes your content directly, with no redirect that can expire or start charging later.',
      },
    ],
    sections: [
      {
        heading: 'Why a CV should be a text PDF, not a picture',
        body: 'Most applications are read first by software that extracts the text and maps it to fields. If your CV is an image — exported as a picture, or built as one large graphic — that software finds nothing, and a strong application can be filtered out before a person ever sees it. A PDF with a real text layer avoids this entirely. So does keeping the structure conventional: recognisable section headings, dates in a consistent format, and contact details as text rather than inside a logo. Design flourishes that break the reading order cost more than they gain.',
      },
      {
        heading: 'Picking a chart type that does not mislead',
        body: 'Bars compare quantities across categories and should start at zero, because the length of the bar is the number — a truncated axis makes a 3% difference look like a landslide. Lines show change over time and may start elsewhere, since the slope carries the meaning rather than the height. Pie charts work only for a handful of slices that genuinely sum to a whole, and become unreadable past about five; a bar chart is almost always the clearer answer. Scatter plots are for the relationship between two measures, not for anything with a category axis.',
      },
      {
        heading: 'What a QR code actually holds',
        body: 'A QR code contains your content directly — a URL, a Wi-Fi network, a contact card, plain text. Many free generators instead encode a short link on their own domain that redirects to yours, which means the code keeps working only while that service does, and it can be metered, redirected or put behind a subscription after your posters are printed. Encoding the destination directly makes the code permanent and unmeterable, at the cost of a denser pattern and no scan statistics. Choose a higher error-correction level for anything printed, where a scuff or a logo overlay has to be survivable.',
      },
    ],
    faqs: [
      {
        question: 'Where is my work saved?',
        answer: 'In your own browser. The resume builder autosaves a draft and the chart and report builders can save named templates, all in this browser on this device, because there is no account and no server to sync through. Clearing your site data clears them, and they do not follow you to another machine — treat the exported file as the real artefact.',
      },
      {
        question: 'Does the Excel export keep formatting, or just numbers?',
        answer: 'It keeps the formatting: header styling, number and currency formats, alignment, column widths, frozen panes, subtotals, grand totals and conditional colour all survive. Numbers are written as numbers with a display format rather than as text, so the file still adds up and recalculates once it is open.',
      },
      {
        question: 'What file types can I load into the builders?',
        answer: 'XLSX, XLS, ODS and CSV, or paste a table straight in. Column types are detected on the way, which is what lets the tools offer sensible defaults for which fields make good axes, groupings and measures.',
      },
      {
        question: 'Can I use the output commercially?',
        answer: 'Yes. What you make is yours, there is no watermark on any output, no attribution requirement and no paid tier that unlocks a better version of the same file.',
      },
    ],
  },

  // ---------------------------------------------------------------- RECORD
  record: {
    chooserHeading: 'What the recorder does',
    chooser: [
      {
        need: 'A demo, a bug report or a walkthrough to send someone',
        href: '/record/screen',
        label: 'Screen recorder',
        why: 'Captures a tab, a window or the whole screen, then trims and annotates it before you save.',
      },
    ],
    sections: [
      {
        heading: 'Recording in the browser, and what that means for your video',
        body: 'Screen capture is a browser capability, so a recording never has to leave your machine to exist. The video is assembled in the tab and handed to your downloads folder. Nothing is uploaded, there is no processing queue, no length cap imposed by a free plan, and no watermark burned into the corner of the result. The practical limits are the ones your own hardware sets: a long recording at a high resolution occupies memory while it is being made.',
      },
      {
        heading: 'Capturing a tab, a window, or the whole screen',
        body: 'The three options are not interchangeable. A tab capture follows one page and cannot accidentally show your inbox, which makes it the right default for a product demo and the safest choice if you are recording anything you will share publicly. A window capture follows one application, including its menus. A full-screen capture shows everything, notifications included — worth turning those off first. Audio is a separate permission: your microphone for narration, and system audio, which browsers only offer for tab and screen captures and not on every platform.',
      },
      {
        heading: 'Making a recording people will actually watch',
        body: 'Most screen recordings are too long, and the fix is nearly always trimming rather than re-recording. Cut the first few seconds, which are almost always you finding the window, and the last few, which are you reaching for the stop button. Move deliberately and pause between steps: a cursor darting around is hard to follow at any speed. If you are demonstrating something small, zoom the page itself before recording rather than relying on the viewer to squint at a full-resolution capture scaled down in a chat window.',
      },
    ],
    faqs: [
      {
        question: 'Is my recording uploaded anywhere?',
        answer: 'No. The capture is assembled in this browser tab and saved straight to your device. There is no upload step, no account and no copy on any server — which also means nobody, including us, can recover a recording you did not save.',
      },
      {
        question: 'Can I record system audio as well as my voice?',
        answer: 'Sometimes. Microphone audio works broadly. Capturing the sound the computer is playing is offered by the browser only for tab and full-screen captures, and support varies by browser and operating system — Chrome on Windows is the most reliable combination, and macOS is the most restrictive.',
      },
      {
        question: 'How long can a recording be?',
        answer: 'There is no imposed limit. The constraint is memory: the video is held by the tab while it is being recorded, so very long captures at high resolution can exhaust it. For anything lengthy, record in sections — which usually makes for a better video anyway.',
      },
    ],
  },
};
