import { calculateDiscountPercent, calculateQuoteTotals, summarizeQuoteItems, validateQuoteLine } from './cotizaciones'
import { formatPrice } from './commerce'

export const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia bancaria' },
  { value: 'otro', label: 'Otro' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
]

export function calculateSaleTotals(items = [], discountPercent = 0) {
  return calculateQuoteTotals(items, discountPercent)
}

export const validateSaleLine = validateQuoteLine
export { calculateDiscountPercent }
export const summarizeSaleItems = summarizeQuoteItems

export function validateAbono(abono, total) {
  if (abono === '' || abono === undefined || abono === null) return { valid: true, value: 0 }
  const value = Number(abono)
  if (!Number.isSafeInteger(value) || value < 0) return { valid: false, message: 'El abono debe ser un valor entero mayor o igual a 0.' }
  if (!Number.isSafeInteger(Number(total)) || value > Number(total)) return { valid: false, message: 'El abono no puede superar el total de la venta.' }
  return { valid: true, value }
}

export function saleEstadoLabel(venta = {}) {
  return venta.estado_pago === 'pagado' || Number(venta.abono_valor) >= Number(venta.total) ? 'Pagada' : 'Pendiente'
}

export function saleShareText(customerName, total) {
  const amount = formatPrice(total)
  return customerName
    ? `Hola ${customerName}, aquí tienes tu comprobante de Poder Oculto por ${amount}.`
    : `Aquí tienes tu comprobante de Poder Oculto por ${amount}.`
}
