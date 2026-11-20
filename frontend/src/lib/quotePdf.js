import { jsPDF } from 'jspdf'
import { formatPrice } from './commerce'
import { formatDate, expirationLabel, getExpirationDate } from './cotizaciones'

const FOOTER = 'Este documento es una cotización formal y está sujeto a cambios. Para más información, por favor contáctenos. Gracias por considerar nuestros servicios. Estamos aquí para ayudarle.'
const BUSINESS = { name: 'Paola Ossa', phone: '3214411674', email: 'paomontoya2810@gmail.com', identification: '52529944', seller: 'Paola Ossa' }

function imageToPng(url) {
  if (!url || typeof Image === 'undefined' || !globalThis.CanvasRenderingContext2D) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => resolve(null), 1800)
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 140
        canvas.height = 140
        const context = canvas.getContext('2d')
        if (!context) { resolve(null); return }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch { resolve(null) }
    }
    image.onerror = () => { clearTimeout(timer); resolve(null) }
    image.src = url
  })
}

function pageIfNeeded(doc, y, margin = 18) {
  if (y > 260) {
    doc.addPage()
    return margin
  }
  return y
}

function addWrappedPaged(doc, text, x, y, width, lineHeight = 4.5, margin = 18) {
  const lines = doc.splitTextToSize(String(text || ''), width)
  for (const line of lines) {
    if (y > 276) {
      doc.addPage()
      y = margin
    }
    doc.text(line, x, y)
    y += lineHeight
  }
  return y
}

export function getQuotePdfContent(quote, { now = new Date() } = {}) {
  const expirationDate = getExpirationDate(quote.created_at || now, quote.expiracion)
  return {
    stamp: formatDate(now, { hour: '2-digit', minute: '2-digit' }),
    business: BUSINESS,
    customerName: String(quote.cliente?.nombre || quote.cliente_nombre || ''),
    seller: BUSINESS.seller,
    rows: (quote.items || []).map((item) => {
      const description = String(item.descripcion || '').trim()
      return { item, description: description.length > 180 ? `${description.slice(0, 179)}…` : description, code: String(item.codigo || ''), quantity: String(item.cantidad), unitPrice: formatPrice(item.precio_unitario), value: formatPrice(item.valor ?? item.cantidad * item.precio_unitario) }
    }),
    discountValue: Number(quote.descuento_valor) > 0 ? formatPrice(quote.descuento_valor) : null,
    subtotal: formatPrice(quote.subtotal),
    total: formatPrice(quote.total),
    expirationText: expirationDate ? `Válida por ${expirationLabel(quote.expiracion)}, hasta ${formatDate(expirationDate)}.` : `Vigencia: ${expirationLabel(quote.expiracion)}.`,
    conceptText: quote.concepto?.trim() ? `Concepto: ${quote.concepto.trim()}` : '',
    footer: FOOTER,
  }
}

export async function generateQuotePdf(quote, { now = new Date() } = {}) {
  const content = getQuotePdfContent(quote, { now })
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const right = pageWidth - margin
  const [logo, ...productImages] = await Promise.all([imageToPng('/brand/mark.svg'), ...content.rows.map(({ item }) => imageToPng(item.imagen_url))])
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(content.stamp, right, 16, { align: 'right' })
  if (logo) doc.addImage(logo, 'PNG', margin, 20, 24, 24)
  else {
    doc.setDrawColor(178, 141, 79)
    doc.circle(margin + 12, 32, 11)
    doc.setFontSize(6)
    doc.text('PODER', margin + 12, 31, { align: 'center' })
    doc.text('OCULTO', margin + 12, 35, { align: 'center' })
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(content.business.name, margin + 30, 27)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Tel. ${content.business.phone}  ·  ${content.business.email}`, margin + 30, 34)
  doc.text(`Identificación: ${content.business.identification}`, margin + 30, 40)
  doc.setDrawColor(178, 141, 79)
  doc.line(margin, 50, right, 50)

  let y = 59
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Cliente', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(content.customerName, margin + 25, y)
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.text('Vendedor', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(content.seller, margin + 25, y)
  y += 13

  const columns = { product: margin, code: 103, quantity: 133, unit: 150, value: right }
  const drawTableHeader = (top) => {
    doc.setFillColor(243, 236, 221)
    doc.rect(margin, top - 5, pageWidth - 2 * margin, 9, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Productos', columns.product + 2, top)
    doc.text('Código', columns.code, top)
    doc.text('Cant.', columns.quantity, top, { align: 'center' })
    doc.text('Precio unitario', columns.unit, top, { align: 'right' })
    doc.text('Valor', columns.value, top, { align: 'right' })
    return top + 10
  }
  y = drawTableHeader(y)
  for (const [index, { item, description, code, quantity, unitPrice, value }] of content.rows.entries()) {
    const image = productImages[index]
    const productX = columns.product + 2
    const textX = productX + (image ? 15 : 0)
    const textWidth = columns.code - textX - 4
    const productLines = [...doc.splitTextToSize(String(item.nombre || ''), textWidth), ...doc.splitTextToSize(description, textWidth)]
    const codeLines = doc.splitTextToSize(code, columns.quantity - columns.code - 4)
    const rowHeight = Math.max(14, productLines.length * 3.6, codeLines.length * 3.6) + 3
    if (y + rowHeight > 276) {
      doc.addPage()
      y = drawTableHeader(margin)
    }
    if (image) doc.addImage(image, 'PNG', productX, y - 4, 12, 12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const nameLines = doc.splitTextToSize(String(item.nombre || ''), textWidth)
    doc.text(nameLines, textX, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(doc.splitTextToSize(description, textWidth), textX, y + nameLines.length * 3.6)
    doc.text(codeLines, columns.code, y)
    doc.text(quantity, columns.quantity, y, { align: 'center' })
    doc.text(unitPrice, columns.unit, y, { align: 'right' })
    doc.text(value, columns.value, y, { align: 'right' })
    y += rowHeight
    doc.setDrawColor(225, 216, 201)
    doc.line(margin, y, right, y)
    y += 5
  }

  y = pageIfNeeded(doc, y + 2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Detalle del pago', margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (content.discountValue) {
    doc.text('Descuento', right - 53, y)
    doc.text(`-${content.discountValue}`, right, y, { align: 'right' })
    y += 6
  }
  doc.text('Subtotal', right - 53, y)
  doc.text(content.subtotal, right, y, { align: 'right' })
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Total', right - 53, y)
  doc.text(content.total, right, y, { align: 'right' })
  y += 13

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y = addWrappedPaged(doc, content.expirationText, margin, y, pageWidth - 2 * margin)
  if (content.conceptText) y = addWrappedPaged(doc, content.conceptText, margin, y + 3, pageWidth - 2 * margin)
  y += 8
  doc.setFontSize(8)
  doc.setTextColor(90, 85, 76)
  addWrappedPaged(doc, content.footer, margin, y, pageWidth - 2 * margin, 4)
  doc.setTextColor(0, 0, 0)
  return doc
}

export { BUSINESS as QUOTE_BUSINESS, FOOTER as QUOTE_FOOTER }
