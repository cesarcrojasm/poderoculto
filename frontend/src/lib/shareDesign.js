export async function createDesignPng(svgElement) {
  if (!svgElement) throw new Error('No hay una vista previa para compartir.')
  const clone = svgElement.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '1080')
  clone.setAttribute('height', '810')
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  background.setAttribute('width', '100%')
  background.setAttribute('height', '100%')
  background.setAttribute('fill', '#fffdf8')
  clone.insertBefore(background, clone.firstChild)
  const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = URL.createObjectURL(svgBlob)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('No se pudo generar la imagen del diseño.'))
      image.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 810
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Este navegador no permite generar imágenes.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(new File([blob], 'mi-manilla-personalizada.png', { type: 'image/png' })) : reject(new Error('No se pudo exportar la imagen del diseño.')), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function downloadDesignPng(file) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
