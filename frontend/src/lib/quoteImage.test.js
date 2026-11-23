import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDocument } from 'pdfjs-dist'
import { renderQuotePdfAsPng } from './quoteImage'

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))

afterEach(() => vi.restoreAllMocks())

function stubPdfPages(sizes) {
  const pdf = {
    numPages: sizes.length,
    getPage: vi.fn(async (index) => ({
      getViewport: ({ scale }) => ({ width: sizes[index - 1][0] * scale, height: sizes[index - 1][1] * scale }),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
    })),
    destroy: vi.fn(),
  }
  getDocument.mockReturnValue({ promise: Promise.resolve(pdf) })
  const contexts = []
  const canvases = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
    const context = { drawImage: vi.fn() }
    contexts.push(context)
    canvases.push(this)
    return context
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback, mimeType) {
    callback(new Blob(['image-bytes'], { type: mimeType }))
  })
  return { pdf, contexts, canvases }
}

describe('quote PDF image rendering', () => {
  it('renders a one-page PDF into a PNG at 2x scale', async () => {
    const state = stubPdfPages([[100, 200]])
    const png = await renderQuotePdfAsPng(new ArrayBuffer(8))
    expect(png).toBeInstanceOf(Blob)
    expect(png.type).toBe('image/png')
    expect(state.canvases).toHaveLength(2)
    expect(state.canvases[0]).toMatchObject({ width: 200, height: 400 })
    expect(state.contexts[0].drawImage).toHaveBeenCalledOnce()
    expect(state.canvases[1]).toMatchObject({ width: 0, height: 0 })
    expect(state.pdf.destroy).toHaveBeenCalledOnce()
  })

  it('combines multiple PDF pages into one vertically stacked PNG', async () => {
    const state = stubPdfPages([[100, 200], [80, 50]])
    await renderQuotePdfAsPng(new ArrayBuffer(8))
    expect(state.canvases).toHaveLength(3)
    expect(state.canvases[0]).toMatchObject({ width: 200, height: 500 })
    expect(state.contexts[0].drawImage).toHaveBeenCalledTimes(2)
    expect(state.canvases.slice(1)).toEqual([expect.objectContaining({ width: 0, height: 0 }), expect.objectContaining({ width: 0, height: 0 })])
  })

  it('scales long documents down to safe canvas dimensions', async () => {
    const state = stubPdfPages(Array.from({ length: 10 }, () => [600, 900]))
    await renderQuotePdfAsPng(new ArrayBuffer(8))
    const canvas = state.canvases[0]
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeLessThanOrEqual(16000)
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(40000000)
  })

  it('rejects documents that would require an unreadably small image scale', async () => {
    const state = stubPdfPages(Array.from({ length: 40 }, () => [600, 900]))
    await expect(renderQuotePdfAsPng(new ArrayBuffer(8))).rejects.toThrow('Quote PDF is too long to export as one image.')
    expect(state.pdf.destroy).toHaveBeenCalledOnce()
  })

  it('rejects if canvas context is unavailable', async () => {
    stubPdfPages([[100, 100]])
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(renderQuotePdfAsPng(new ArrayBuffer(8))).rejects.toThrow('Canvas rendering is unavailable.')
  })

  it('rejects if the browser cannot export a PNG blob', async () => {
    stubPdfPages([[100, 100]])
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))
    await expect(renderQuotePdfAsPng(new ArrayBuffer(8))).rejects.toThrow('Could not export quote image.')
  })
})
