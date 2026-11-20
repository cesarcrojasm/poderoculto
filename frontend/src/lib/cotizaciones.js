import { formatPrice, whatsappUrl } from './commerce'

export const EXPIRATION_OPTIONS = ['1_semana', '15_dias', '1_mes', 'no_expira']
export const MAX_QUOTE_AMOUNT = 2147483647

export function validateCustomer(customer = {}) {
  const name = String(customer.nombre || '').trim()
  const cellphone = String(customer.celular || '').trim()
  if (!name) return { valid: false, field: 'nombre', message: 'El nombre es obligatorio.' }
  if (name.length > 100) return { valid: false, field: 'nombre', message: 'El nombre no puede superar 100 caracteres.' }
  if (cellphone.length < 7 || cellphone.length > 20) return { valid: false, field: 'celular', message: 'El celular debe tener entre 7 y 20 caracteres.' }
  return { valid: true, value: { nombre: name, celular: cellphone, direccion: String(customer.direccion || '').trim() || null } }
}

export function validateQuoteLine(line = {}) {
  if (line.cantidad === '' || line.cantidad === null || line.cantidad === undefined || line.precio_unitario === '' || line.precio_unitario === null || line.precio_unitario === undefined) return false
  const quantity = Number(line.cantidad)
  const price = Number(line.precio_unitario)
  const lineTotal = quantity * price
  return Number.isSafeInteger(quantity) && quantity >= 1 && Number.isInteger(price) && price >= 0 && Number.isSafeInteger(lineTotal) && lineTotal <= MAX_QUOTE_AMOUNT
}

export function calculateQuoteTotals(items = [], discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio_unitario || 0), 0)
  const percentage = Math.min(100, Math.max(0, Number(discountPercent) || 0))
  const discountValue = Math.round(subtotal * percentage / 100)
  return { subtotal, descuento_porcentaje: percentage, descuento_valor: discountValue, total: subtotal - discountValue }
}

export function calculateDiscountPercent(subtotal, discountValue) {
  if (!Number(subtotal)) return 0
  const boundedValue = Math.min(Number(subtotal), Math.max(0, Number(discountValue) || 0))
  return Math.round((boundedValue / Number(subtotal)) * 10000) / 100
}

export function summarizeQuoteItems(items = []) {
  return items.map((item) => `${item.cantidad} ${item.nombre}`).join(', ')
}

export function expirationLabel(expiration) {
  return ({ '1_semana': '1 semana', '15_dias': '15 días', '1_mes': '1 mes', no_expira: 'No expira' })[expiration] || 'No expira'
}

export function getExpirationDate(createdAt, expiration) {
  if (!createdAt || expiration === 'no_expira' || !EXPIRATION_OPTIONS.includes(expiration)) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  if (expiration === '1_semana') date.setDate(date.getDate() + 7)
  if (expiration === '15_dias') date.setDate(date.getDate() + 15)
  if (expiration === '1_mes') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + 1)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day, lastDay))
  }
  return date
}

export function formatDate(date, options = {}) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  const formattedDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(value).replace(/ de /g, ' ')
  if (!options.hour && !options.minute) return formattedDate
  const time = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
  return `${formattedDate} - ${time}`
}

export function formatQuoteWhatsAppMessage(customerName, total, pdfUrl) {
  return `Hola ${customerName}, aquí tienes tu cotización de Poder Oculto por ${formatPrice(total)}. Puedes verla aquí: ${pdfUrl}`
}

export function quoteWhatsAppUrl(customer, quote) {
  return whatsappUrl(customer.celular, formatQuoteWhatsAppMessage(customer.nombre, quote.total, quote.pdf_url))
}
