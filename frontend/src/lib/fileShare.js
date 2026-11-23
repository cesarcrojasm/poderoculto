function downloadFile(file, documentObject, urlApi) {
  const objectUrl = urlApi.createObjectURL(file)
  const anchor = documentObject.createElement('a')
  anchor.href = objectUrl
  anchor.download = file.name
  anchor.hidden = true
  documentObject.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => urlApi.revokeObjectURL(objectUrl), 1000)
}

export async function shareOrDownloadFile(file, { title, text, shareApi = globalThis.navigator, documentObject = globalThis.document, urlApi = globalThis.URL } = {}) {
  let canShareFiles = false
  try {
    canShareFiles = typeof shareApi?.canShare === 'function'
      && typeof shareApi?.share === 'function'
      && shareApi.canShare({ files: [file] })
  } catch {
    canShareFiles = false
  }

  if (!canShareFiles) {
    downloadFile(file, documentObject, urlApi)
    return 'downloaded'
  }

  try {
    await shareApi.share({ files: [file], title, text })
    return 'shared'
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled'
    if (error?.name === 'NotAllowedError') {
      downloadFile(file, documentObject, urlApi)
      return 'downloaded'
    }
    throw error
  }
}
