![cover](public/demos/cover.png)

# 📄PDFZero - Free Open-Source PDF Editor. 

> Edit PDFs in your browser. No uploads. No task limits. No sign-up. Free.

[![Open Source](https://img.shields.io/badge/open%20source-yes-brightgreen)]()
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Privacy First](https://img.shields.io/badge/privacy-100%25%20local-success)]()
[![Offline Ready](https://img.shields.io/badge/offline-ready-blueviolet)]()
[![Built with React](https://img.shields.io/badge/built%20with-React-61DAFB?logo=react&logoColor=white)]()
[![PDF.js](https://img.shields.io/badge/PDF.js-Mozilla-orange)]()
[![pdf-lib](https://img.shields.io/badge/pdf--lib-core-red)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-pink.svg)]()

---  

## Why PDFZero?

Many PDF tools charge monthly, cap file sizes, or limit what you can do on free plans. PDFZero keeps the core workflow simple: edit locally, keep your files on-device, and use the important tools without a paywall.  

## Demo  
![demo](public/demos/demo.gif)  
  
## 🌐 Try PDFZero Live

🔗 **https://pdfzero-editor.vercel.app**  
Edit, organize, secure, and optimize PDFs directly in your browser - all FREE while keeping your files on your device.  
  

---  
---

| Feature | Other PDF tools | **PDFZero** |
|---|---|---|
| Edit existing PDF text | Often paid or limited | **Free** |
| File size limits | Often capped | **No file size limit** |
| Daily task limits | Free plans may stop after a few tasks | **No task limits** |
| File privacy | Files may be uploaded to a server | **100% local** |
| Offline use | Usually browser or cloud-based | **Works offline** |
| Open source | Rare | **MIT** |
| OCR for scanned PDFs | Often paid | **Free** |
| e-Sign PDFs | Often paid | **Free** |
| Cost | Many plans charge monthly | **Free** |

---

## Features

### Edit
- **Edit existing PDF text** - click any text block, edit in-place, and auto-detect the original font
- Add new text boxes anywhere on the page
- Change font family, size, color, bold, and italic
- Add, replace, and remove images

### Organize
- Merge multiple PDFs with drag-to-reorder
- Split PDF by page range
- Reorder pages via drag-and-drop
- Rotate individual pages
- Extract specific pages

### Optimize
- Compress PDF with browser-native object stream compression
- PDF/A compliance check

### Secure
- Password protect with AES-256
- Remove existing passwords
- Redact sensitive content permanently
- Add text watermarks

### Smart
- OCR for scanned and image PDFs with Tesseract.js, running offline
- AI font matching to keep text edits visually consistent

---

## Tech Stack

| Library | Purpose |
|---|---|
| [pdf-lib](https://pdf-lib.js.org/) | PDF creation, modification, export |
| [PDF.js](https://mozilla.github.io/pdf.js/) | PDF rendering and text extraction |
| [Tesseract.js](https://tesseract.projectnaptha.com/) | OCR for scanned PDFs |
| [React](https://react.dev/) | UI framework |
| [Zustand](https://zustand-demo.pmnd.rs/) | State management |
| [Vite](https://vitejs.dev/) | Build tool |

**Zero backend. Zero tracking. Zero analytics. 100% browser-native.**

---

## Getting Started

```bash
git clone https://github.com/bevinkatti/pdfzero.git
cd pdfzero
npm install
npm run dev
npm run build
```

---

## Architecture

```text
src/
  components/
    editor/          # PdfCanvas, TextBlock, AnnotationLayer, Toolbars
    layout/          # Navbar
    ui/              # DropZone, shared components
  lib/
    pdfRenderer.js   # PDF.js wrapper - render pages, extract text
    pdfExporter.js   # pdf-lib wrapper - export, merge, split, etc.
  pages/
    Landing.jsx      # Marketing landing page
    Editor.jsx       # Main PDF editor
    Tools.jsx        # Individual tool UIs
  store/
    pdfStore.js      # Zustand global state
  styles/
    globals.css      # Design system tokens
```

### Text editing architecture

PDFZero uses a layered editing model:

```text
PDF bytes
  -> PDF.js render + text extraction
  -> canonical text run metadata
  -> browser overlay editor
  -> layout-fit/export planner
  -> pdf-lib browser export
  -> future PDFium/MuPDF advanced engine
```

Current browser path:

1. **Render** - PDF.js renders each page to a high-resolution canvas.
2. **Extract** - PDF.js extracts text runs, transforms, font ids, approximate font names, color, baseline, ascent/descent, and edit boxes.
3. **Model** - PDFZero stores original run metadata: text, bbox, baseline, font fallback, color, line height, estimated glyph advances, and max edit dimensions.
4. **Overlay** - Editable DOM text is positioned over the PDF raster and uses local background sampling to hide the original text while editing.
5. **Fit** - On export, edited text is laid out line-by-line and fit back to the original run width using conservative character spacing and small size adjustment.
6. **Export** - pdf-lib writes background patches, replacement text, annotations, page operations, and document tools.

This is not yet full Acrobat/Foxit-style object editing. The current path is an overlay-and-repair browser exporter. The production-grade target is an advanced engine that can inspect and rewrite PDF page objects directly:

```text
src/pdf/
  engines/
    pdfjsEngine.ts       # Browser render/extract fallback
    pdfiumEngine.ts      # Planned object-level editor
    mupdfEngine.ts       # Optional native/WASM alternative
  model/
    TextRun.ts           # glyphs, fonts, colors, matrices, resources
    FontResource.ts
    EditOperation.ts
  layout/
    glyphMetrics.ts
    fitText.ts
    paragraphReflow.ts
  background/
    renderWithoutText.ts
    inpaintPatch.ts
  export/
    exportPlanner.ts
    pdfLibOverlayExporter.ts
    objectRewriteExporter.ts
  repair/
    visualDiff.ts
    autoFitRepair.ts
```

The browser-only implementation can be excellent for simple and moderately complex PDFs. True high-level editing for embedded subset fonts, object removal, kerning-preserving replacement, complex scripts, and image/gradient background reconstruction requires PDFium, MuPDF, or another real PDF content engine.

---

## Roadmap

- [x] PDF rendering and text extraction overlay
- [x] Add new text boxes
- [x] Drag-and-drop text positioning
- [x] Annotations (highlight, redact, shapes)
- [x] Merge, split, compress tools
- [x] Watermark, rotate, page management
- [x] Preserve richer original text-run metadata for export fitting
- [x] Fit edited text back to the original run width during pdf-lib export
- [ ] **v1.1** - OCR via Tesseract.js with searchable text layer
- [ ] **v1.1** - Visual export diff for edited regions
- [ ] **v1.1** - Packaged fallback font registry with width-vector matching
- [ ] **v1.1** - Image add/replace/remove
- [ ] **v1.1** - e-Sign with canvas signature pad
- [ ] **v1.2** - Paragraph grouping and multi-line reflow
- [ ] **v1.2** - PDF to Word/DOCX export
- [ ] **v1.2** - Form filling and flattening
- [ ] **v1.2** - Batch processing
- [ ] **Advanced** - PDFium/MuPDF object-level text replacement
- [ ] **Advanced** - Embedded font reuse and kerning-preserving export
- [ ] **Advanced** - Background reconstruction by rendering pages with target text objects removed

---

## Contributing

PRs are very welcome. Please open an issue first for major changes.

```bash
npm install
npm run dev
```


---

## License

MIT Copyright PDFZero contributors 
  
  ---  
If you find PDFZero useful, consider giving a ⭐.
