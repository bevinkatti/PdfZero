# Contributing to PDFZero

Thanks for wanting to help! PDFZero is a free, open-source PDF editor that runs
entirely in the browser. Contributions of all sizes are welcome: bug fixes,
features, tests, docs, and design polish.

## Ground rules

PDFZero has a few principles that every change must respect:

- **100% local.** No file uploads, no backend, no tracking, no analytics. Do not
  add any code that sends a user's PDF or its contents over the network.
- **No paywalls or limits.** Features stay free, with no file size or task caps.
- **Works offline.** Avoid dependencies that require a live network call at runtime.
- **Small, focused PRs.** One issue per pull request is much easier to review.

## Getting started

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/PdfZero.git
cd PdfZero

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev

# 4. Make sure a production build still works before opening a PR
npm run build
```

## Finding something to work on

- Browse [open issues](https://github.com/bevinkatti/PdfZero/issues) and look for
  the `good first issue` and `help wanted` labels.
- Comment on the issue to claim it so two people don't work on the same thing.
- For anything big (new tool, new engine, large refactor), **open an issue first**
  and discuss the approach before writing code.

## Project layout

```
src/
  components/
    editor/     # PdfCanvas, TextBlock, AnnotationLayer, toolbars
    layout/     # Navbar
    ui/         # DropZone and shared components
  lib/
    pdfRenderer.js   # PDF.js wrapper: render pages, extract text
    pdfExporter.js   # pdf-lib wrapper: export, merge, split, etc.
  pages/
    Landing.jsx
    Editor.jsx
    Tools.jsx
  store/
    pdfStore.js      # Zustand global state
  styles/
    globals.css      # Design tokens
```

Rendering and text extraction live in `pdfRenderer.js`; everything that writes a
PDF lives in `pdfExporter.js`. If you are touching text editing, read the
"Text editing architecture" section of the README first.

## Making changes

1. Create a branch from `main`:
   ```bash
   git checkout -b fix/short-description
   ```
2. Make your change. Follow the existing code style (React function components,
   Zustand for shared state, design tokens from `globals.css` instead of
   hard-coded colors).
3. Test it manually in the browser (see below).
4. Commit with a clear message, for example:
   `fix: keep whiteout color accurate on tinted backgrounds`
5. Push to your fork and open a pull request against `main`.

## Testing your change

There is no full automated suite yet (adding one is a great first contribution).
Until then, please check by hand:

- Load a simple text PDF, a multi-page PDF, and a scanned/image PDF.
- Exercise the tool you changed, then **export and open the result** in another
  viewer (browser, Preview, Acrobat) to confirm it is valid.
- Confirm `npm run build` succeeds with no new warnings.
- If you changed text editing, check that fonts, size and position of edited
  text still match the original.

## Pull request checklist

- [ ] Linked the issue (`Closes #123`)
- [ ] Change is focused on a single concern
- [ ] `npm run build` passes
- [ ] Tested with real PDFs and verified the exported file opens correctly
- [ ] No network calls added that touch user documents
- [ ] Added screenshots or a short GIF for UI changes
- [ ] Updated the README if behavior or the roadmap changed

## Reporting bugs

Open an issue and include:

- What you did, what you expected, and what happened instead
- Browser and OS
- A sample PDF that reproduces it, if it is safe to share (please **remove any
  sensitive content first**; PDFZero stays private and so should bug reports)
- Console errors, if any

## Suggesting features

Open an issue describing the problem you want solved, not just the solution.
Check the README roadmap first; your idea may already be planned.

## Code of conduct

Be kind and constructive. Assume good intent, review the code and not the person,
and help newcomers get unstuck. Harassment or disrespectful behavior is not
tolerated.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).