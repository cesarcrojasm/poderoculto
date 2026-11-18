import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDesignPng } from './shareDesign'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('design image sharing', () => {
  it('renders the preview SVG as a high-resolution PNG file', async () => {
    class FakeImage {
      set src(value) { this.url = value; queueMicrotask(() => this.onload()) }
    }
    const drawImage = vi.fn()
    const png = new Blob(['png-bytes'], { type: 'image/png' })
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:svg'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(png))
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 360 270')

    const result = await createDesignPng(svg)

    expect(result).toBeInstanceOf(File)
    expect(result.name).toBe('mi-manilla-personalizada.png')
    expect(result.type).toBe('image/png')
    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 1080, 810)
  })

  it('rejects when no preview SVG is available', async () => {
    await expect(createDesignPng(null)).rejects.toThrow('No hay una vista previa para compartir.')
  })
})
