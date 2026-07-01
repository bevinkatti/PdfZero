import { create } from 'zustand'

const MAX_HISTORY = 100

const cloneEditState = (s) => ({
  editLayers: JSON.parse(JSON.stringify(s.editLayers || {})),
  extractedEdits: JSON.parse(JSON.stringify(s.extractedEdits || {})),
})

const pushHistory = (s) => ({
  historyPast: [...s.historyPast, cloneEditState(s)].slice(-MAX_HISTORY),
  historyFuture: [],
})

export const usePdfStore = create((set, get) => ({
  file: null,
  fileName: '',
  fileSize: 0,
  pageCount: 0,
  currentPage: 1,
  zoom: 1.0,

  // editLayers[pageNum] = { texts: [], annotations: [] }
  editLayers: {},

  // extractedEdits[pageNum][originalId] = newStr  — tracks committed edits
  extractedEdits: {},
  historyPast: [],
  historyFuture: [],

  selectedElement: null,
  selectedElementPage: null,
  pageBgs: {},
  activeTool: "select",

  // Mobile drawer visibility — Pages (left) and Properties (right) panels
  // become slide-in overlays below a 768px breakpoint. Only one open at a time.
  mobilePagesOpen: false,
  mobilePropertiesOpen: false,

  setFile:           (file, fileName, fileSize) => set({ file, fileName, fileSize }),
  setPageCount:      (pageCount)   => set({ pageCount }),
  setCurrentPage:    (p)           => set({ currentPage: p, selectedElement: null, selectedElementPage: null }),
  setZoom:           (z)           => set({ zoom: Math.max(0.25, Math.min(3.0, Math.round(z * 100) / 100)) }),
  setActiveTool:     (t)           => set({ activeTool: t, selectedElement: null, selectedElementPage: null }),
  setPageBg: (pageNum, bg) => set(s => ({ pageBgs: { ...s.pageBgs, [pageNum]: bg } })),
  setSelectedElement:(el, page)    => set({ selectedElement: el, selectedElementPage: page }),

  setMobilePagesOpen: (open) => set({
    mobilePagesOpen: open,
    mobilePropertiesOpen: open ? false : get().mobilePropertiesOpen,
  }),
  setMobilePropertiesOpen: (open) => set({
    mobilePropertiesOpen: open,
    mobilePagesOpen: open ? false : get().mobilePagesOpen,
  }),
  closeMobilePanels: () => set({ mobilePagesOpen: false, mobilePropertiesOpen: false }),

  getLayer: (pageNum) => {
    const { editLayers } = get()
    return editLayers[pageNum] || { texts: [], annotations: [] }
  },

  // Add a brand-new user text box
  addTextBlock: (pageNum, block) => set((s) => {
    const layer = s.editLayers[pageNum] || { texts: [], annotations: [] }
    return {
      ...pushHistory(s),
      editLayers: {
        ...s.editLayers,
        [pageNum]: { ...layer, texts: [...layer.texts, block] },
      },
    }
  }),

  // Update a user-added block in the layer
  updateTextBlock: (pageNum, id, updates) => set((s) => {
    const layer = s.editLayers[pageNum]
    if (!layer) return {}
    const existing = layer.texts.find(t => t.id === id)
    if (!existing) return {}
    const updated = { ...existing, ...updates }
    return {
      ...pushHistory(s),
      editLayers: {
        ...s.editLayers,
        [pageNum]: {
          ...layer,
          texts: layer.texts.map(t => t.id === id ? updated : t),
        },
      },
      ...(s.selectedElement?.id === id && s.selectedElementPage === pageNum
        ? { selectedElement: updated }
        : {}),
    }
  }),

  removeTextBlock: (pageNum, id) => set((s) => {
    const layer = s.editLayers[pageNum]
    if (!layer) return {}
    if (!layer.texts.some(t => t.id === id)) return {}
    return {
      ...pushHistory(s),
      editLayers: {
        ...s.editLayers,
        [pageNum]: { ...layer, texts: layer.texts.filter(t => t.id !== id) },
      },
      ...(s.selectedElement?.id === id && s.selectedElementPage === pageNum
        ? { selectedElement: null, selectedElementPage: null }
        : {}),
    }
  }),

  // Called when user finishes editing an EXTRACTED block.
  // Stores the edit in editLayers AND marks original for whiteout on export.
  // Carries ALL original block metadata (font, size, color, position) so export
  // can reproduce the text in the correct style and position.
  commitExtractedEdit: (pageNum, originalBlock, newStr) => set((s) => {
    const layer = s.editLayers[pageNum] || { texts: [], annotations: [] }
    const edits = s.extractedEdits[pageNum] || {}
    const editId = `edited-${originalBlock.id}`

    // All original style info preserved — only str changes
    const editedBlock = {
      // Position & size from original
      x:          originalBlock.x,
      y:          originalBlock.y,
      width:      originalBlock.width,
      height:     originalBlock.height,
      // Font metadata — critical for export
      fontSize:   originalBlock.fontSize,
      fontName:   originalBlock.fontName,
      fontFamily: originalBlock.fontFamily,
      fontBold:   originalBlock.fontBold,
      fontItalic: originalBlock.fontItalic,
      fontUnderline: originalBlock.fontUnderline,
      stdFont:    originalBlock.stdFont,
      baselineOffset: originalBlock.baselineOffset,
      ascent:     originalBlock.ascent,
      descent:    originalBlock.descent,
      scaleX:     originalBlock.scaleX,
      scaleY:     originalBlock.scaleY,
      rotation:   originalBlock.rotation || 0,
      lineHeight: originalBlock.lineHeight,
      editBox:    originalBlock.editBox,
      glyphs:     originalBlock.glyphs,
      kerning:    originalBlock.kerning,
      kerningSource: originalBlock.kerningSource,
      // Color from original
      color:      originalBlock.color || '#000000',
      colorSpace: originalBlock.colorSpace || 'DeviceRGB',
      fillOpacity: originalBlock.fillOpacity ?? 1,
      textRenderingMode: originalBlock.textRenderingMode ?? 0,
      charSpacing: originalBlock.charSpacing ?? 0,
      wordSpacing: originalBlock.wordSpacing ?? 0,
      horizontalScale: originalBlock.horizontalScale ?? 1,
      fontResource: originalBlock.fontResource,
      internalFontName: originalBlock.internalFontName,
      embeddedFontName: originalBlock.embeddedFontName,
      fontWeight: originalBlock.fontWeight,
      fontStyle: originalBlock.fontStyle,
      // Edited string
      str:        newStr,
      // Flags
      id:         editId,
      originalId: originalBlock.id,
      originalStr: originalBlock.str,
      isEdited:   true,
      isExtracted:false,
      // Preserve children info for multi-fragment whiteout
      children:   originalBlock.children,
      originalX:  originalBlock.x,
      originalY:  originalBlock.y,
      originalWidth: originalBlock.width,
      originalHeight: originalBlock.height,
      originalFontSize: originalBlock.fontSize,
      originalBaselineOffset: originalBlock.baselineOffset,
      originalLineHeight: originalBlock.lineHeight,
      maxEditWidth: originalBlock.maxEditWidth ?? originalBlock.width,
      maxEditHeight: originalBlock.maxEditHeight ?? originalBlock.height,
      exportStrategy: 'overlay-fit',
      visualDriftScore: null,
    }

    const existing = layer.texts.find(t => t.id === editId)
    const nextEditedBlock = existing
      ? {
          ...existing,
          str: newStr,
          originalX: existing.originalX ?? originalBlock.x,
          originalY: existing.originalY ?? originalBlock.y,
          originalWidth: existing.originalWidth ?? originalBlock.width,
          originalHeight: existing.originalHeight ?? originalBlock.height,
          originalFontSize: existing.originalFontSize ?? originalBlock.fontSize,
          originalBaselineOffset: existing.originalBaselineOffset ?? originalBlock.baselineOffset,
          originalLineHeight: existing.originalLineHeight ?? originalBlock.lineHeight,
          maxEditWidth: existing.maxEditWidth ?? originalBlock.maxEditWidth ?? originalBlock.width,
          maxEditHeight: existing.maxEditHeight ?? originalBlock.maxEditHeight ?? originalBlock.height,
          editBox: existing.editBox ?? originalBlock.editBox,
          glyphs: existing.glyphs ?? originalBlock.glyphs,
          kerning: existing.kerning ?? originalBlock.kerning,
          fontResource: existing.fontResource ?? originalBlock.fontResource,
        }
      : editedBlock
    const newTexts = existing
      ? layer.texts.map(t => t.id === editId ? nextEditedBlock : t)
      : [...layer.texts, nextEditedBlock]

    return {
      ...pushHistory(s),
      editLayers: {
        ...s.editLayers,
        [pageNum]: { ...layer, texts: newTexts },
      },
      extractedEdits: {
        ...s.extractedEdits,
        [pageNum]: { ...edits, [originalBlock.id]: newStr },
      },
      selectedElement: nextEditedBlock,
      selectedElementPage: pageNum,
    }
  }),

  addAnnotation: (pageNum, annotation) => set((s) => {
    const layer = s.editLayers[pageNum] || { texts: [], annotations: [] }
    return {
      ...pushHistory(s),
      editLayers: {
        ...s.editLayers,
        [pageNum]: { ...layer, annotations: [...layer.annotations, annotation] },
      },
    }
  }),

  undoEdit: () => {
    let didUndo = false
    set((s) => {
      const previous = s.historyPast[s.historyPast.length - 1]
      if (!previous) return {}
      didUndo = true
      return {
        editLayers: previous.editLayers,
        extractedEdits: previous.extractedEdits,
        historyPast: s.historyPast.slice(0, -1),
        historyFuture: [cloneEditState(s), ...s.historyFuture].slice(0, MAX_HISTORY),
        selectedElement: null,
        selectedElementPage: null,
      }
    })
    return didUndo
  },

  redoEdit: () => {
    let didRedo = false
    set((s) => {
      const next = s.historyFuture[0]
      if (!next) return {}
      didRedo = true
      return {
        editLayers: next.editLayers,
        extractedEdits: next.extractedEdits,
        historyPast: [...s.historyPast, cloneEditState(s)].slice(-MAX_HISTORY),
        historyFuture: s.historyFuture.slice(1),
        selectedElement: null,
        selectedElementPage: null,
      }
    })
    return didRedo
  },

  reset: () => set({
    file: null, fileName: '', fileSize: 0, pageCount: 0, currentPage: 1,
    zoom: 1.0, editLayers: {}, extractedEdits: {}, selectedElement: null,
    selectedElementPage: null, activeTool: "select", pageBgs: {},
    historyPast: [], historyFuture: [],
    mobilePagesOpen: false, mobilePropertiesOpen: false,
  }),
}))

// ── pageBgs added separately so we don't rewrite the whole store ──
// We store detected background colors per page so export can use correct whiteout
