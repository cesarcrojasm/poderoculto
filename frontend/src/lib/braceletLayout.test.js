import { describe, expect, it } from 'vitest'
import { BRACELET_POSITION_GAP, repositionBraceletElement } from './braceletLayout'

describe('bracelet layout', () => {
  it('moves a piece across neighbors and maintains spacing within track bounds', () => {
    const result = repositionBraceletElement([
      { key: 'left', position: 0.5 },
      { key: 'middle', position: 0.5 },
      { key: 'right', position: 0.5 },
    ], 'right', 0)
    expect(result.map((item) => item.key)).toEqual(['right', 'left', 'middle'])
    expect(result[0].position).toBe(0)
    expect(result[1].position - result[0].position).toBeGreaterThanOrEqual(BRACELET_POSITION_GAP)
    expect(result[2].position - result[1].position).toBeGreaterThanOrEqual(BRACELET_POSITION_GAP - 1e-10)
    expect(result.every((item) => item.position >= 0 && item.position <= 1)).toBe(true)
  })

  it('clamps a drag to leave room for every piece and leaves unknown keys unchanged', () => {
    const elements = [{ key: 'a', position: 0.2 }, { key: 'b', position: 0.8 }]
    const movedToEnd = repositionBraceletElement(elements, 'a', 1)
    expect(movedToEnd[1].position).toBe(1)
    expect(movedToEnd[1].position - movedToEnd[0].position).toBeGreaterThanOrEqual(BRACELET_POSITION_GAP - 1e-10)
    expect(repositionBraceletElement(elements, 'missing', 0.4)).toEqual(elements)
  })
})
