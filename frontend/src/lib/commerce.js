export function formatPrice(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0)
}

export function braceletPrice(configuration, config, stones, metals, charms = []) {
  const stonePrices = configuration.stones.reduce((sum, stone) => {
    const catalogStone = stones.find((item) => item.id === stone.stoneId)
    return sum + (catalogStone?.price || 0)
  }, 0)
  const metalPrice = metals.find((item) => item.id === configuration.metalId)?.price || 0
  const charmPrice = charms.find((item) => item.id === configuration.charmId)?.price || 0
  return config.basePrice + stonePrices + metalPrice + charmPrice
}

export function cartTotal(items) {
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
}

export function makeOrderMessage(items, total) {
  const details = items.map((item, index) => {
    if (item.type === 'custom') {
      const names = item.configuration.stones.map((stone) => stone.name).join(', ')
      const options = [item.configuration.weave, `hilo ${item.configuration.thread}`, names && `piedras: ${names}`, item.configuration.charm && `dije ${item.configuration.charmName || item.configuration.charm}`, item.configuration.metal && `bola ${item.configuration.metalName || item.configuration.metal}`].filter(Boolean).join(' · ')
      return `${index + 1}. ${item.name} × ${item.quantity} — ${formatPrice(item.price * item.quantity)}\n   ${options}`
    }
    return `${index + 1}. ${item.name} × ${item.quantity} — ${formatPrice(item.price * item.quantity)}`
  }).join('\n')
  return `Hola, quiero hacer este pedido:\n\n${details}\n\nTotal: ${formatPrice(total)}\n\nPedido enviado desde la tienda Poder Oculto.`
}

export function whatsappUrl(number, message) {
  return `https://wa.me/${String(number).replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

export function readCart(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem('poder-oculto-cart')
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
