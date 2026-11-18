import { describe, expect, it } from 'vitest'
import { getNextProductOrder, getProductOrderUpdates, getStorageObjectPath, hasUnsavedProductOrder, isValidProductImage, moveItem } from './adminProducts'

describe('admin product helpers', () => {
  it('reorders items and safely returns unchanged arrays for invalid moves', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveItem(items, 'a', 'c').map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(moveItem(items, 'unknown', 'c')).toBe(items)
    expect(moveItem(items, 'a', 'a')).toBe(items)
  })

  it('extracts only product bucket storage paths', () => {
    expect(getStorageObjectPath('https://project.supabase.co/storage/v1/object/public/productos/uuid/foto%20uno.jpg')).toBe('uuid/foto uno.jpg')
    expect(getStorageObjectPath('/products/1.1.jpeg')).toBeNull()
    expect(getStorageObjectPath(undefined)).toBeNull()
    expect(getStorageObjectPath('https://project/storage/v1/object/public/productos/%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('validates supported image types and the five megabyte limit', () => {
    expect(isValidProductImage({ type: 'image/webp', size: 100 })).toBe(true)
    expect(isValidProductImage({ type: 'image/svg+xml', size: 100 })).toBe(false)
    expect(isValidProductImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe(false)
    expect(isValidProductImage(null)).toBe(false)
  })

  it('detects staged order changes and creates consecutive save updates', () => {
    const products = [{ id: 'b', orden: 2 }, { id: 'a', orden: 1 }]
    expect(hasUnsavedProductOrder(products, ['a', 'b'])).toBe(true)
    expect(hasUnsavedProductOrder(products, ['b', 'a'])).toBe(false)
    expect(getProductOrderUpdates(products)).toEqual([{ id: 'b', orden: 1 }, { id: 'a', orden: 2 }])
  })

  it('places new items after the current highest order', () => {
    expect(getNextProductOrder([{ orden: 2 }, { orden: 8 }, { orden: null }])).toBe(9)
    expect(getNextProductOrder([])).toBe(1)
  })
})
