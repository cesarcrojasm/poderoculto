import { describe, expect, it, vi } from 'vitest'
import { shareOrDownloadFile } from './fileShare'

function makeDownloadEnvironment() {
  const anchor = { click: vi.fn(), remove: vi.fn(), set href(value) { this.url = value }, set download(value) { this.filename = value } }
  const documentObject = { body: { appendChild: vi.fn() }, createElement: vi.fn(() => anchor) }
  const urlApi = { createObjectURL: vi.fn(() => 'blob:quote'), revokeObjectURL: vi.fn() }
  return { anchor, documentObject, urlApi }
}

const file = new File(['quote'], 'cotizacion.pdf', { type: 'application/pdf' })

describe('quote file sharing', () => {
  it('shares the actual file when file sharing is supported', async () => {
    const shareApi = { canShare: vi.fn(() => true), share: vi.fn().mockResolvedValue(undefined) }
    await expect(shareOrDownloadFile(file, { title: 'Cotización Poder Oculto', text: 'Hola Ana', shareApi })).resolves.toBe('shared')
    expect(shareApi.canShare).toHaveBeenCalledWith({ files: [file] })
    expect(shareApi.share).toHaveBeenCalledWith({ files: [file], title: 'Cotización Poder Oculto', text: 'Hola Ana' })
  })

  it('treats cancelling the native share sheet as a non-error', async () => {
    const shareApi = { canShare: () => true, share: vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' })) }
    await expect(shareOrDownloadFile(file, { shareApi })).resolves.toBe('cancelled')
  })

  it.each([
    ['file sharing is unavailable', { canShare: () => false, share: vi.fn() }],
    ['the share API is missing', {}],
    ['canShare throws', { canShare: () => { throw new Error('unsupported') }, share: vi.fn() }],
  ])('downloads when %s', async (_label, shareApi) => {
    vi.useFakeTimers()
    const download = makeDownloadEnvironment()
    await expect(shareOrDownloadFile(file, { shareApi, ...download })).resolves.toBe('downloaded')
    expect(download.documentObject.createElement).toHaveBeenCalledWith('a')
    expect(download.documentObject.body.appendChild).toHaveBeenCalled()
    expect(download.anchor).toMatchObject({ url: 'blob:quote', filename: file.name })
    expect(download.anchor.click).toHaveBeenCalledOnce()
    expect(download.anchor.remove).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(download.urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:quote')
    vi.useRealTimers()
  })

  it('downloads when native sharing rejects because user activation is unavailable', async () => {
    vi.useFakeTimers()
    const download = makeDownloadEnvironment()
    const shareApi = { canShare: () => true, share: vi.fn().mockRejectedValue(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })) }
    await expect(shareOrDownloadFile(file, { shareApi, ...download })).resolves.toBe('downloaded')
    expect(download.anchor.click).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('propagates unexpected native-share errors for the UI to report', async () => {
    const error = new Error('share failed')
    const shareApi = { canShare: () => true, share: vi.fn().mockRejectedValue(error) }
    await expect(shareOrDownloadFile(file, { shareApi })).rejects.toBe(error)
  })
})
