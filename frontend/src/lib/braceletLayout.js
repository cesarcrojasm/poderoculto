export const BRACELET_POSITION_GAP = 0.075

export function repositionBraceletElement(elements, movingKey, nextPosition, gap = BRACELET_POSITION_GAP) {
  const ordered = elements
    .map((element) => ({ ...element, position: Math.max(0, Math.min(1, Number(element.position) || 0)) }))
    .sort((a, b) => a.position - b.position || String(a.key).localeCompare(String(b.key)))
  const initialMovingIndex = ordered.findIndex((element) => element.key === movingKey)
  if (initialMovingIndex < 0) return ordered

  const moving = ordered[initialMovingIndex]
  moving.position = Math.max(0, Math.min(1, Number.isFinite(nextPosition) ? nextPosition : moving.position))
  ordered.sort((a, b) => a.position - b.position || String(a.key).localeCompare(String(b.key)))
  const movingIndex = ordered.findIndex((element) => element.key === movingKey)
  const minimum = movingIndex * gap
  const maximum = 1 - (ordered.length - movingIndex - 1) * gap
  moving.position = Math.max(minimum, Math.min(maximum, moving.position))
  ordered.sort((a, b) => a.position - b.position || String(a.key).localeCompare(String(b.key)))
  const finalMovingIndex = ordered.findIndex((element) => element.key === movingKey)

  for (let index = finalMovingIndex - 1; index >= 0; index -= 1) {
    const upperBound = ordered[index + 1].position - gap
    const lowerBound = index * gap
    ordered[index].position = Math.max(lowerBound, Math.min(ordered[index].position, upperBound))
  }

  for (let index = finalMovingIndex + 1; index < ordered.length; index += 1) {
    const lowerBound = ordered[index - 1].position + gap
    const upperBound = 1 - (ordered.length - index - 1) * gap
    ordered[index].position = Math.min(upperBound, Math.max(ordered[index].position, lowerBound))
  }

  return ordered
}
