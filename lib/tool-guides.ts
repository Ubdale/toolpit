/**
 * The "how do I" and "but what about" content for every tool.
 *
 * This lives beside `tools.ts` rather than inside it because it is a different
 * kind of thing: `tools.ts` is the routing and naming spine that nav, sitemap
 * and metadata are derived from, and folding four steps and four answers into
 * each of its entries would bury that spine in prose.
 *
 * Both halves are rendered on the page *and* emitted as HowTo and FAQPage
 * structured data. That order matters — the schema describes content a visitor
 * can actually read. Marking up answers that only exist for a crawler is the
 * thing search engines penalise, and it would also be a lie.
 */

export type Faq = { question: string; answer: string };

export type ToolGuide = {
  /** Numbered steps. Three or four; anything longer is not a step list. */
  steps: string[];
  faqs: Faq[];
};

const PRIVACY_ANSWER =
  'No. There is no upload step and no server that could receive the file — the tool runs as code in this browser tab, works on the copy your browser opened, and forgets it when you close the tab. You can check this yourself: open your browser’s network panel and run the tool. You will see the page, its scripts and the ads that pay for the site — and no request carrying your file, because there is no endpoint to carry it to.';

const WATERMARK_ANSWER =
  'Never. There is no watermark, no page limit, no daily cap and no paid tier that unlocks the real output. Toolpit costs nothing to run per file, because your device does the work.';

export const guides: Record<string, ToolGuide> = {
  // ------------------------------------------------------------------- PDF
  '/pdf/merge': {
    steps: [
      'Drop in the PDFs you want to combine, or click to choose them.',
      'Drag the files into the order you want them to appear.',
      'Click Merge, then download the single combined PDF.',
    ],
    faqs: [
      { question: 'Are my files uploaded anywhere?', answer: PRIVACY_ANSWER },
      {
        question: 'How many PDFs can I merge at once?',
        answer:
          'As many as your device has memory for. There is no imposed limit, because there is no server bill that scales with the number of files — most people merging dozens of documents will hit their patience before they hit a technical ceiling.',
      },
      {
        question: 'Does merging reduce the quality of the pages?',
        answer:
          'No. Merging copies each page object across unchanged, so text stays text, images keep their original resolution, and nothing is re-compressed. The merged file is roughly the sum of the originals.',
      },
      {
        question: 'Will bookmarks, links and form fields survive?',
        answer:
          'Links within a page and the page content itself come through intact. Document-level extras — the bookmark outline, and form fields that share names across documents — may not survive the merge, which is a limitation of combining separate documents rather than of this tool.',
      },
    ],
  },

  '/pdf/split': {
    steps: [
      'Drop in the PDF you want to split.',
      'Enter the pages or ranges to extract, such as "1-3, 8, 12-".',
      'Download the pages as one new PDF, or as separate files.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'How do I write a page range?',
        answer:
          'Use commas between entries and a hyphen inside a range: "1-3, 8, 12-" means pages one to three, page eight, and everything from page twelve to the end. Pages come out in the order you list them, so "5, 1" really does put page five first.',
      },
      {
        question: 'Can I split one PDF into many single-page files?',
        answer:
          'Yes — choose the option to split into separate files and every selected page is written to its own PDF, delivered together as a ZIP.',
      },
    ],
  },

  '/pdf/organize': {
    steps: [
      'Drop in the PDF you want to rearrange.',
      'Use the thumbnails to reorder, rotate or delete pages.',
      'Click Save and download the reorganised PDF.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Why is one page sideways when the others are not?',
        answer:
          'Scanners often record a rotation flag rather than rotating the image itself, so a page can look upright in one viewer and sideways in another. Rotating it here writes the correct orientation into the file, which fixes it everywhere.',
      },
      {
        question: 'Can I undo a deleted page?',
        answer:
          'Use Reset to restore the document to how it arrived. Nothing is written until you click Save, so the original file on your disk is untouched no matter what you do here.',
      },
    ],
  },

  '/pdf/compress': {
    steps: [
      'Drop in the PDF you want to make smaller.',
      'Choose lossless tidying, or re-rendering pages for a much bigger saving.',
      'Compress, compare the new size, and download.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Why are there two compression modes?',
        answer:
          '"Compress PDF" means two different things. Lossless rewriting drops orphaned objects and packs the file more tightly — nothing degrades, and the saving is usually modest. Re-rendering turns each page into an image, which shrinks scan-heavy files dramatically but makes the text unselectable. Toolpit offers both rather than picking one and calling it magic.',
      },
      {
        question: 'My PDF barely got smaller. Why?',
        answer:
          'A PDF that is mostly text is already small and highly compressed; there is little left to remove. Large PDFs are almost always large because of images, so if lossless mode gains you nothing, the size is in the pictures — try the re-render mode and lower the quality.',
      },
      { question: 'Is there a file-size limit?', answer: WATERMARK_ANSWER },
    ],
  },

  '/pdf/images-to-pdf': {
    steps: [
      'Drop in your JPG, PNG or other image files.',
      'Put them in order and choose a page size and margin.',
      'Create the PDF and download it.',
    ],
    faqs: [
      { question: 'Are my photos uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Which image formats can I use?',
        answer:
          'JPG and PNG are embedded directly. WebP, AVIF, GIF and BMP are re-encoded by your browser first, so they work too — the conversion happens on your device either way.',
      },
      {
        question: 'Should I pick A4 or "fit to image"?',
        answer:
          'Choose A4 or Letter if the PDF is going to be printed or submitted somewhere with a page-size requirement. Choose fit-to-image when the images are screenshots or artwork and you want no border at all.',
      },
    ],
  },

  '/pdf/to-images': {
    steps: [
      'Drop in the PDF you want to turn into pictures.',
      'Choose PNG or JPG and the resolution you need.',
      'Export and download the images, or take them all as a ZIP.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'What resolution should I choose?',
        answer:
          'The multiplier is relative to the PDF’s natural size, where 1x is roughly 72 DPI. Use 2x (about 144 DPI) for screens, and 3x or 4x if the image is going to be printed or cropped into.',
      },
      {
        question: 'PNG or JPG?',
        answer:
          'PNG for pages that are mostly text, diagrams or flat colour — it stays sharp and has no compression artefacts around letterforms. JPG for photographic pages, where it produces a much smaller file at the same apparent quality.',
      },
    ],
  },

  '/pdf/excel-to-pdf': {
    steps: [
      'Drop in one or many XLSX, XLS, ODS or CSV files.',
      'Pick the sheets, page size and orientation you want.',
      'Convert, then download one combined PDF or a ZIP of one per file.',
    ],
    faqs: [
      { question: 'Is my spreadsheet uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Does it keep my formatting?',
        answer:
          'Bold, italic and underline, font sizes, text and fill colours, alignment, merged cells, your column widths, hidden rows and columns, and number formats all come through. Dates and currency arrive as the formatted text you see in the spreadsheet, not as raw serial numbers.',
      },
      {
        question: 'What happens to a sheet that is too wide for the page?',
        answer:
          'Rather than shrinking it until nobody can read it, wide sheets are split across column bands — the same rows continue on a following page with the remaining columns, and headers repeat.',
      },
      {
        question: 'How many workbooks can I convert at once?',
        answer:
          'There is no limit on the number of files. Drop a whole folder in and take away one combined PDF or a ZIP of one per workbook.',
      },
    ],
  },

  '/pdf/pdf-to-excel': {
    steps: [
      'Drop in one or many PDFs containing tables.',
      'Check the detected rows and columns in the preview.',
      'Download an XLSX or CSV, per document or combined.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Will it work on a scanned PDF?',
        answer:
          'No. This reads the PDF’s text layer and rebuilds the table from where the words actually sit on the page. A scan is a picture of a table with no text layer at all, so there is nothing to read — that needs OCR, which this tool does not do.',
      },
      {
        question: 'The columns came out slightly wrong. Why?',
        answer:
          'A PDF has no concept of a table — only text at coordinates. The columns are inferred from how the words line up, which works well for ordinary reports and less well for nested headers, multi-line cells or heavily merged layouts. Check the preview before you rely on the numbers.',
      },
    ],
  },

  '/pdf/edit': {
    steps: [
      'Drop in the PDF you want to change.',
      'Pick a tool — text, highlight, box, line, draw or image — and mark up the page.',
      'Select any mark to restyle or move it, then save the edited PDF.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Can I sign a PDF with this?',
        answer:
          'Yes. Use the Draw tool to sign with a mouse, trackpad or finger, or use the Image tool to place a photo of your signature — a PNG with a transparent background looks best. This produces a visible signature on the page, not a cryptographic digital signature.',
      },
      {
        question: 'Can I edit the text that is already in the PDF?',
        answer:
          'Yes. Choose “Edit text” and the tool reads the page’s own text, boxes every line it finds, and lets you rewrite any of them. The original glyphs are deleted from the file and yours are drawn in their place at the same position, size, colour and typeface — so the result is still real, selectable, searchable text rather than a picture patched over the old words.',
      },
      {
        question: 'Why can’t I make a paragraph re-wrap after editing it?',
        answer:
          'Because a PDF has no paragraphs. Text is stored as instructions — "set this font, move the pen here, draw these glyphs" — with no record of which lines belong together, so there is nothing to re-flow. Replacing a line is exact; a longer replacement simply occupies more width, and the tool warns you when that happens so you can check it has not run into anything. No PDF editor can reflow arbitrary text, and the ones that appear to are re-typesetting the page from a guess about its structure.',
      },
      {
        question: 'Nothing is highlighted when I choose “Edit text”. Why?',
        answer:
          'The page has no text layer — it is a scan or an exported image, so there are no glyphs to replace, only pixels. Use a box filled white to cover it and the Text tool to type over the top.',
      },
      {
        question: 'Will my marks be editable later, or are they permanent?',
        answer:
          'They are flattened into the page content, so they look identical in every viewer and survive printing and flattening. The trade-off is that they cannot be selected and deleted afterwards — which is usually what you want for a signature or a redaction box.',
      },
      { question: 'Is there a watermark or a page limit?', answer: WATERMARK_ANSWER },
    ],
  },

  '/pdf/watermark': {
    steps: [
      'Drop in the PDF you want to mark.',
      'Type your text or choose a logo, then set the placement, size and opacity.',
      'Check the live preview and download the watermarked PDF.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Can the watermark be removed by someone else?',
        answer:
          'It is drawn into the page content, so it will not come off by clicking it or deleting an annotation. It is not, however, tamper-proof: anyone determined enough can re-render the page and paint it out. A watermark marks a document’s status — it is not a security control.',
      },
      {
        question: 'What opacity should I use?',
        answer:
          'Somewhere between 10% and 25% for a diagonal stamp across text — low enough to read the page through, high enough to survive a photocopy. Tiled watermarks want the lower end of that range, because there are twelve of them.',
      },
      {
        question: 'Can I use my own logo instead of text?',
        answer:
          'Yes — drop in a PNG or JPG. A PNG with a transparent background gives much the better result, since a JPG will stamp its white rectangle onto the page along with the logo.',
      },
    ],
  },

  '/pdf/page-numbers': {
    steps: [
      'Drop in the PDF you want to number.',
      'Choose a format, a corner, and which page the numbering starts on.',
      'Check the preview and download the numbered PDF.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'How do I skip the cover page?',
        answer:
          'Put "2-" in the pages field. The cover is left clean and numbering begins on page two — and if you want that page to still read "1", set Start at to 1.',
      },
      {
        question: 'Can I number pages that already have numbers?',
        answer:
          'You can, but you will end up with two sets. If the existing numbers are wrong because pages were merged or reordered, the usual fix is to place the new number in a different corner so it is clearly the authoritative one.',
      },
      {
        question: 'Does it handle pages of different sizes or rotations?',
        answer:
          'Yes. The position is worked out per page from that page’s own size and rotation, so a landscape page in the middle of a portrait document still gets its number in the corner you chose.',
      },
    ],
  },

  '/pdf/remove-watermark': {
    steps: [
      'Drop in the watermarked PDF — it is scanned as soon as it lands.',
      'Check what the scan found, and tick what you want gone.',
      'Watch the preview update, then download the clean PDF.',
    ],
    faqs: [
      { question: 'Is my document uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'How is this different from painting over the watermark?',
        answer:
          'Painting over it makes the page a picture and takes your text with it. This deletes the watermark from the file’s structure — the stamp annotation, the layer, the text run, or the repeated image — so everything else is untouched and your document’s text is still selectable and searchable afterwards.',
      },
      {
        question: 'Why did it find nothing in my PDF?',
        answer:
          'Because there is nothing to find. If the file came from a scanner, or was flattened or re-rendered by whoever sent it, the watermark stopped being a separate object and became part of the page image. No tool can cleanly delete it at that point; the only options are to paint over it or to leave it, and the tool tells you which case you are in rather than pretending to work.',
      },
      {
        question: 'It listed my page header. Will it delete that too?',
        answer:
          'Only if you tick it. Anything repeated on most pages gets listed — a running header repeats just as reliably as a watermark does — so findings are ranked, and only the ones that clearly read as a watermark are ticked for you. Everything else sits under “probably real content” and is left alone unless you say otherwise.',
      },
      {
        question: 'Should I be removing this watermark?',
        answer:
          'That is between you and whoever put it there. This is the ordinary case of taking a DRAFT stamp off your own document, or a mark you added yourself — a watermark is a label, not a licence, and removing one does not change who owns the underlying work.',
      },
    ],
  },

  // ------------------------------------------------------------------- SVG
  '/svg/optimize': {
    steps: [
      'Paste your SVG markup, or drop in an .svg file.',
      'Choose how aggressively to clean it, and compare before and after.',
      'Copy the optimised markup or download the smaller file.',
    ],
    faqs: [
      { question: 'Is my file uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'What is actually being removed?',
        answer:
          'Editor metadata, comments, empty groups, unused definitions, default attribute values, and excess decimal places on coordinates. None of it affects how the image draws — an SVG exported from a design tool is often more than half bloat.',
      },
      {
        question: 'Could optimising break my SVG?',
        answer:
          'It can, in two specific cases: if your CSS or JavaScript targets ids and classes inside the SVG, or if the file relies on markup a cleaner considers redundant. Compare the preview, and if the SVG is scripted or styled from outside, keep ids intact.',
      },
    ],
  },

  '/svg/favicon-generator': {
    steps: [
      'Drop in a square image — an SVG or a large PNG is ideal.',
      'Check how it looks at each size, from 512px down to 16px.',
      'Download the package and paste the generated HTML into your site.',
    ],
    faqs: [
      { question: 'Is my artwork uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Which favicon sizes do I actually need in 2026?',
        answer:
          'Far fewer than the thirty-file packs suggest. An SVG icon, a 512px PNG for web app manifests, a 180px apple-touch-icon, and a small ICO for older browsers covers essentially everything. The generated HTML includes exactly these.',
      },
      {
        question: 'Why does my logo look like a smudge at 16 pixels?',
        answer:
          'Because sixteen pixels is sixteen pixels. A favicon is a monogram, not a logo — drop the wordmark, keep one letter or one shape, and increase the contrast. The preview at each size is there so you find this out before you ship it.',
      },
    ],
  },

  // ----------------------------------------------------------------- image
  '/image/remove-background': {
    steps: [
      'Drop in the photo you want cut out.',
      'Wait once while the AI model downloads to your browser, then let it run.',
      'Download the cut-out as a transparent PNG.',
    ],
    faqs: [
      { question: 'Is my photo uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Why is there a wait the first time?',
        answer:
          'The AI model itself has to be downloaded — that is the one-off cost of running it on your device instead of someone else’s server. It is cached afterwards, so the second image starts immediately.',
      },
      {
        question: 'Is the result watermarked or lower resolution?',
        answer:
          'No. You get the full-resolution cut-out with no watermark and no paywall between you and it — which is the difference between this and most background removers.',
      },
      {
        question: 'What kind of images work best?',
        answer:
          'A clear subject against a reasonably distinct background. Hair, fur and semi-transparent edges like glass or veils are the hard cases for every background remover, on-device or not.',
      },
    ],
  },

  '/image/upscale': {
    steps: [
      'Drop in the image you want to enlarge.',
      'Choose a model and scale, then let it run on your device.',
      'Compare before and after, and download the larger image.',
    ],
    faqs: [
      { question: 'Is my photo uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Can it recover detail that is not there?',
        answer:
          'No — and neither can anything else, whatever the marketing says. The model has learned what edges and textures usually look like, so it produces a convincing larger image rather than a blurry one. It is plausible detail, not recovered detail; do not treat an upscaled photo as evidence.',
      },
      {
        question: 'Why is it slow on a large image?',
        answer:
          'The work is happening on your own hardware rather than a rack of GPUs. A small image is quick; a 4000-pixel photo at 4x is a genuinely large amount of computation. Closing other heavy tabs helps.',
      },
    ],
  },

  '/image/remove-object': {
    steps: [
      'Drop in the photo you want to clean up.',
      'Brush over whatever you want gone.',
      'Let the AI fill the gap, then download the result.',
    ],
    faqs: [
      { question: 'Is my photo uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'How do I get a better fill?',
        answer:
          'Brush slightly wider than the object, including its shadow — a leftover shadow is what usually gives the edit away. Simple, repeating backgrounds like sky, grass, walls and pavement fill almost invisibly; busy or structured backgrounds are much harder.',
      },
      {
        question: 'Can I remove something from a very large photo?',
        answer:
          'Yes, though the model works on a region at a time and larger images take longer. If the result looks soft, try removing one object at a time rather than brushing several at once.',
      },
    ],
  },

  '/image/resize': {
    steps: [
      'Drop in one image or a whole folder of them.',
      'Set a width, a height, an exact box or a percentage.',
      'Resize and download the images, or take them all as a ZIP.',
    ],
    faqs: [
      { question: 'Are my images uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'How many images can I resize at once?',
        answer:
          'There is no limit. Batch tools elsewhere cap you at ten or twenty files because each one costs them an upload and a server round trip; here the work happens on your machine, so the only limit is its memory.',
      },
      {
        question: 'Will resizing make my image blurry?',
        answer:
          'Shrinking is done in halving steps rather than one jump, which averages the pixels properly and avoids the crunchy, aliased look you get from a naive resize. Enlarging is a different matter — there is no new detail to add, which is why "never enlarge" is on by default.',
      },
      {
        question: 'What is the difference between fit, fill and stretch?',
        answer:
          'Fit keeps the whole image and pads the leftover space. Fill covers the box completely and trims the overflow. Stretch forces both edges and distorts the picture — it is there because occasionally you genuinely need it, not because you should.',
      },
    ],
  },

  '/image/convert': {
    steps: [
      'Drop in the images you want to convert.',
      'Choose PNG, JPG, WebP or AVIF, and a quality level.',
      'Convert and download them individually or as a ZIP.',
    ],
    faqs: [
      { question: 'Are my images uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Which format should I choose?',
        answer:
          'WebP for the web — it is smaller than both JPG and PNG and every current browser reads it. AVIF is smaller still but slower to encode and not supported everywhere. JPG for maximum compatibility with older software. PNG when you need transparency or perfectly lossless flat colour.',
      },
      {
        question: 'Why is a format greyed out?',
        answer:
          'Because this browser cannot encode it. Support for writing AVIF in particular varies between browsers, and rather than silently handing you a PNG with the wrong file extension, the tool checks first and tells you.',
      },
      {
        question: 'What happens to transparency when I convert to JPG?',
        answer:
          'JPG has no transparency, so see-through pixels need a colour behind them. The tool asks you which one instead of defaulting to black, which is what a naive conversion produces.',
      },
    ],
  },

  '/image/crop': {
    steps: [
      'Drop in the image you want to trim.',
      'Drag the crop box, or lock it to a ratio and type exact numbers.',
      'Crop and download at full resolution.',
    ],
    faqs: [
      { question: 'Is my image uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Does cropping reduce the quality?',
        answer:
          'No. The crop takes the original pixels inside your box at their full resolution — a crop of a 4000px photo is a genuinely 4000px-detailed piece of that photo, not a resized preview.',
      },
      {
        question: 'What ratio should I use?',
        answer:
          '1:1 for avatars and most profile pictures, 4:5 for social feeds, 16:9 for banners, video thumbnails and slides, and 3:2 for anything going to print at standard photo sizes.',
      },
    ],
  },

  '/image/remove-watermark': {
    steps: [
      'Drop in one image, or the whole set you want cleaned.',
      'Drag a box over each watermark on the first image.',
      'Erase, and download the results or take them all as a ZIP.',
    ],
    faqs: [
      { question: 'Are my images uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Can it really do a whole folder at once?',
        answer:
          'Yes, and that is the point of this tool rather than the object remover. Regions are stored as a proportion of the image, not as pixels, so the box you drew over the corner of the first photo lands on the same corner of every other photo in the set even when they are different sizes.',
      },
      {
        question: 'How good is the result?',
        answer:
          'It depends entirely on what was behind the watermark. Over sky, a wall, grass or any smooth background it is usually invisible. Over a detailed subject — a face, text, fine pattern — the model is inventing plausible pixels rather than recovering real ones, and it can look soft or wrong. Zoom in and check before you use the result for anything that matters.',
      },
      {
        question: 'What about a watermark tiled across the whole image?',
        answer:
          'Draw one big box over the whole affected area rather than dozens of small ones. The result over a busy photo will be soft, because there is that much more for the model to invent — a large tiled watermark is genuinely the hardest case there is.',
      },
      {
        question: 'Should I be removing this watermark?',
        answer:
          'A watermark on a stock preview is there because the image has not been licensed, and taking it off does not license it. Removing your own watermark, or one on an image you have the rights to, is the ordinary use of a tool like this.',
      },
    ],
  },

  // ---------------------------------------------------------------- record
  '/record/screen': {
    steps: [
      'Choose whether to record a tab, a window or the whole screen.',
      'Record, and stop when you are done.',
      'Trim the clip and download it.',
    ],
    faqs: [
      { question: 'Is my recording uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Is there a time limit or a watermark?',
        answer:
          'No to both. Recorders that stamp a logo on your video or cut you off at five minutes do it to sell you the paid tier; there is nothing to sell here, so there is no limit and no logo.',
      },
      {
        question: 'Can I record audio too?',
        answer:
          'Yes — you can capture your microphone, and on browsers that support it, the audio playing in the tab you are sharing. The exact options depend on your browser and operating system, which control what a web page is allowed to capture.',
      },
    ],
  },

  // ---------------------------------------------------------------- create
  '/create/resume': {
    steps: [
      'Fill in your details, experience and education — an example is loaded to edit.',
      'Try the templates until one fits, and nudge the text size to fit the page.',
      'Download a print-ready PDF with selectable text.',
    ],
    faqs: [
      {
        question: 'Are my personal details uploaded?',
        answer:
          'No. Your name, address, phone number and employment history stay in this browser tab, and a draft is saved in this browser’s own storage so a refresh does not lose your work. There is no account, no database and nothing sent anywhere — which is worth knowing, because a resume is one of the most complete personal profiles you will ever type into a web form.',
      },
      {
        question: 'Will this resume pass an applicant tracking system?',
        answer:
          'The PDF contains real, selectable text in a standard font, laid out in reading order — which is what an ATS parses. Just as importantly, none of the templates use a photo, a skills bar chart, or a two-column body for your work history: those three are the reliable ways to make a resume parse as nonsense, so they are simply not offered.',
      },
      {
        question: 'How long should a resume be?',
        answer:
          'One page if you have under about ten years of experience, two if you have more. If you are just over a page, lower the text size slider a few percent or trim a bullet — the page count updates live so you can see the effect.',
      },
      {
        question: 'Can I come back and edit it later?',
        answer:
          'Yes, from the same browser on the same device — the draft is stored locally. It is not synced anywhere, so it will not follow you to another machine, and clearing your browser data will clear it. Keep the downloaded PDF as your real copy.',
      },
    ],
  },

  '/create/chart': {
    steps: [
      'Paste your table, or drop in a CSV.',
      'Pick a chart type and set the title, colours and labels.',
      'Export a PNG for slides or an SVG for print.',
    ],
    faqs: [
      { question: 'Is my data uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'How should my data be laid out?',
        answer:
          'First row names the series, first column labels each point, and everything else is numbers. Tabs, commas and semicolons all work, and the parser reads "1,234", "$1.2k", "45%" and "(300)" the way you meant them.',
      },
      {
        question: 'Why can I not start the bar chart axis somewhere other than zero?',
        answer:
          'Because a bar’s length is the value — cut the axis and a 2% difference looks like a 200% one. Line and scatter charts, where position rather than length carries the value, are not held to the same rule.',
      },
      {
        question: 'Why do the colours look the way they do?',
        answer:
          'The palette is not decorative. It was checked for colour-blind separation between adjacent series, a minimum contrast against the chart background, and consistent lightness — in both light and dark mode. That is also why the series colours are assigned in a fixed order and a ninth series is not given a newly invented hue.',
      },
      {
        question: 'PNG or SVG?',
        answer:
          'PNG for slides, documents and anywhere the chart just needs to be a picture — export at 2x or higher so it stays sharp on a good screen. SVG for print, or when someone needs to open it in a design tool and restyle it.',
      },
    ],
  },

  '/create/chart-builder': {
    steps: [
      'Drop in a CSV or Excel file — an example dataset is loaded to start with.',
      'Pick the category axis and add measures with the aggregation you want.',
      'Choose a chart type and watch the preview redraw as you adjust it.',
    ],
    faqs: [
      { question: 'Is my data uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'How is this different from the chart maker?',
        answer:
          'The chart maker takes a small table you have already shaped and draws it. The builder takes a whole spreadsheet and shapes it for you: it aggregates, filters, ranks and splits into series, and offers thirty chart types rather than seven. Use the maker for a quick chart of numbers you already have; use the builder when the file is the raw data.',
      },
      {
        question: 'Do my saved charts sync between devices?',
        answer:
          'No. Templates are kept in this browser on this device, because there is no account and no server to sync them through. Clearing your site data clears them, so treat the exported image or file as the real artefact.',
      },
      {
        question: 'What happens with a very large file?',
        answer:
          'The preview works on the first few thousand rows so it stays instant, and says so underneath the chart when it is doing that. The aggregation itself runs over what is loaded — for a file large enough to matter, filter it down first.',
      },
    ],
  },

  '/create/report-builder': {
    steps: [
      'Drop in a CSV or Excel file.',
      'Choose columns, grouping or a pivot, and add formatting rules.',
      'Export a formatted .xlsx, a CSV, or print it.',
    ],
    faqs: [
      { question: 'Is my data uploaded?', answer: PRIVACY_ANSWER },
      {
        question: 'Does the Excel export keep the formatting?',
        answer:
          'Yes — header styling, number formats, currency and percent codes, alignment, indentation, subtotal and grand-total borders, frozen panes and column widths all come across. Crucially the numbers are written as numbers with a format code rather than as pre-formatted text, so Excel can still sum them. An export that looks right but cannot be recalculated is not a spreadsheet.',
      },
      {
        question: 'Can it pivot like Excel?',
        answer:
          'It does the common case: one field down the side, one field across the top, and one aggregated measure in the middle, with a total column and a grand-total row. Multi-level nested pivots with several measures at once are beyond what this does.',
      },
      {
        question: 'Does it share anything with the chart builder?',
        answer:
          'The filters, sorting, aggregations, top-N and saved-template mechanism are the same types running through the same engine, so a condition means the same thing in both and the two read as one system.',
      },
    ],
  },

  '/create/ats-checker': {
    steps: [
      'Drop in your resume as a PDF — the same file you would send an employer.',
      'Read the report: anything marked as needing a fix is what a parser could not read.',
      'Optionally paste a job description to see which of its repeated terms your resume is missing.',
    ],
    faqs: [
      {
        question: 'Is my resume uploaded?',
        answer: PRIVACY_ANSWER,
      },
      {
        question: 'How is the score calculated?',
        answer:
          'It starts at 100 and subtracts for each problem, weighted by how badly that problem breaks a real parse. A PDF with no text layer scores zero outright, because nothing else matters if the document cannot be read at all. Missing contact details, missing section headings and unreadable dates cost the most; phrasing issues cost least. The number is a summary of the findings below it, not a verdict from any particular employer’s system.',
      },
      {
        question: 'Does this tell me what a specific company’s ATS will do?',
        answer:
          'No, and be wary of anything that claims to. Employers run different systems, configured differently, and none publishes its rules. What this checks is the layer underneath all of them: whether the text can be extracted, whether the sections and dates are findable, and whether your wording matches the posting. A resume that fails here fails everywhere; one that passes has cleared the part that is actually knowable.',
      },
      {
        question: 'Why does my beautifully designed resume score badly?',
        answer:
          'Because a parser never sees the design. It reads the text in the order the PDF stores it, so multi-column layouts interleave, text inside images disappears entirely, icon fonts extract as meaningless symbols, and details tucked into a header can be skipped. The fix is rarely to make it uglier — it is to keep the body single-column and put every fact in real, selectable text.',
      },
      {
        question: 'Should I paste the job description keywords into my resume?',
        answer:
          'Only where they are true. The keyword check exists to show you which relevant terms you have described in different words, not to supply a list to paste in. A recruiter reads the same document the software scanned, and stuffing — particularly hidden white text — is both detectable and disqualifying.',
      },
    ],
  },

  '/create/qr-code': {
    steps: [
      'Choose what the code should do — a link, Wi-Fi, a contact card or plain text.',
      'Fill in the details and style the code.',
      'Download an SVG for print or a PNG at any size.',
    ],
    faqs: [
      {
        question: 'Will this QR code ever expire or start charging?',
        answer:
          'No. Many "free" QR generators give you a code that points at their own short link, which they can later expire, redirect, meter or put behind a subscription — after your posters are printed. This code encodes your content directly, so there is no middleman and nothing to expire.',
      },
      {
        question: 'Does anyone see who scans it?',
        answer:
          'Nobody, including us. The code encodes your content directly rather than pointing at a redirect we control, so there is nothing in the scan path to count. That is the flip side of the answer above: no middleman also means no scan statistics for you either.',
      },
      {
        question: 'Which error correction level should I choose?',
        answer:
          'Medium is right for most uses. Go to Quartile or High for anything printed, anywhere the code might get scuffed, or if you plan to put a logo over the middle — higher levels recover more damage, at the cost of a denser code.',
      },
      {
        question: 'Why does my code fail to scan?',
        answer:
          'Usually one of three things: too little quiet zone (keep the empty border at four modules), too little contrast between the code and its background, or the code is printed too small for the amount of data in it. Shortening the link helps more than anything else, because it makes the whole grid coarser.',
      },
      {
        question: 'Is it safe to put my Wi-Fi password in a QR code?',
        answer:
          'The password is encoded in the code itself, in readable form — which is exactly how a guest joins the network by scanning it. Treat the printed code like the written-down password it is: fine on a café table, not fine in a photo posted publicly.',
      },
    ],
  },
};

export function getGuide(href: string): ToolGuide | null {
  return guides[href] ?? null;
}
