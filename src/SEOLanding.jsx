/**
 * SEOLanding
 */

const seoStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const FEATURES = [
  'Edit text directly in any PDF — no conversion needed',
  'Multi-page layout for print-ready output',
  'Annotate PDFs with highlights, comments, and shapes',
  'Merge multiple PDF files into one document',
  'Split a PDF by page range or extract individual pages',
  'Compress PDFs to reduce file size',
  'Reorder, rotate, or delete individual pages',
  'OCR support to make scanned PDFs searchable',
  'Whiteout and erase existing PDF content',
  'Re-embed fonts to preserve text fidelity',
];

const FAQS = [
  {
    q: 'Is PDFZero free to use?',
    a: 'Yes. PDFZero is completely free with no registration, no subscription, and no watermarks.',
  },
  {
    q: 'Does PDFZero upload my files to a server?',
    a: 'No. All PDF processing happens directly in your browser using PDF.js and pdf-lib. Your files never leave your device.',
  },
  {
    q: 'Does PDFZero work offline?',
    a: 'PDFZero requires an initial page load over the internet. Once loaded, core editing tools work without an active connection because processing is entirely client-side.',
  },
  {
    q: 'Is PDFZero open source?',
    a: 'Yes. The full source code is available on GitHub at github.com/bevinkatti/PdfZero under the MIT licence.',
  },
  {
    q: 'What browsers does PDFZero support?',
    a: 'PDFZero works in any modern browser — Chrome, Firefox, Edge, and Safari — on desktop and mobile.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No installation required. Open pdfzero-editor.vercel.app in your browser and start editing immediately.',
  },
];

export default function SEOLanding() {
  return (
    <section style={seoStyle} aria-hidden="true">
      <h1>PDFZero - Free Browser-Based PDF Editor</h1>
      <p>
        PDFZero is a free, open-source PDF editor that runs entirely in your browser.
        Edit text, create multi-page layouts, annotate, merge, split, compress, reorder pages, and more — no file
        uploads, no sign-up, and no software to install.
      </p>

      <h2>Features</h2>
      <ul>
        {FEATURES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <h2>Frequently Asked Questions</h2>
      <dl>
        {FAQS.map(({ q, a }) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
