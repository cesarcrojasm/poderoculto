const MAX_CANVAS_SIDE = 16000
const MAX_CANVAS_PIXELS = 40000000
const MIN_IMAGE_SCALE = 0.5

function exportPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export quote image.'))
    }, 'image/png')
  })
}

export async function renderQuotePdfAsPng(pdfBytes) {
  const [pdfjsLib, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  let document
  try {
    document = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise
    const pages = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      pages.push({ page, viewport: page.getViewport({ scale: 1 }) })
    }
    if (!pages.length) throw new Error('Quote PDF has no pages.')

    const maxWidth = pages.reduce((width, { viewport }) => Math.max(width, viewport.width), 0)
    let scale = 2
    const dimensions = () => ({
      width: Math.ceil(maxWidth * scale),
      height: pages.reduce((height, { viewport }) => height + Math.ceil(viewport.height * scale), 0),
    })
    let outputSize = dimensions()
    while (outputSize.width > MAX_CANVAS_SIDE || outputSize.height > MAX_CANVAS_SIDE || outputSize.width * outputSize.height > MAX_CANVAS_PIXELS) {
      scale *= 0.95
      if (scale < MIN_IMAGE_SCALE) throw new Error('Quote PDF is too long to export as one image.')
      outputSize = dimensions()
    }

    const resultCanvas = globalThis.document.createElement('canvas')
    resultCanvas.width = outputSize.width
    resultCanvas.height = outputSize.height
    const resultContext = resultCanvas.getContext('2d')
    if (!resultContext) throw new Error('Canvas rendering is unavailable.')
    let top = 0
    for (const { page } of pages) {
      const viewport = page.getViewport({ scale })
      const pageCanvas = globalThis.document.createElement('canvas')
      pageCanvas.width = Math.ceil(viewport.width)
      pageCanvas.height = Math.ceil(viewport.height)
      const pageContext = pageCanvas.getContext('2d')
      if (!pageContext) throw new Error('Canvas rendering is unavailable.')
      await page.render({ canvasContext: pageContext, viewport }).promise
      resultContext.drawImage(pageCanvas, 0, top)
      top += pageCanvas.height
      pageCanvas.width = 0
      pageCanvas.height = 0
    }
    return await exportPng(resultCanvas)
  } finally {
    await document?.destroy?.()
  }
}
