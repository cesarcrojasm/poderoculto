export function moveItem(items, activeId, overId) {
  const from = items.findIndex((item) => item.id === activeId)
  const to = items.findIndex((item) => item.id === overId)
  if (from < 0 || to < 0 || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function getStorageObjectPath(url) {
  if (typeof url !== 'string') return null
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/productos\/([^?#]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export function isValidProductImage(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  return Boolean(allowedTypes.includes(file?.type) && file.size > 0 && file.size <= 5 * 1024 * 1024)
}

export function getNextProductOrder(products) {
  return products.reduce((max, product) => Math.max(max, Number(product.orden) || 0), 0) + 1
}

export function hasUnsavedProductOrder(products, savedIds) {
  return products.length !== savedIds.length || products.some((product, index) => product.id !== savedIds[index])
}

export function getProductOrderUpdates(products) {
  return products.map((product, index) => ({ id: product.id, orden: index + 1 }))
}
