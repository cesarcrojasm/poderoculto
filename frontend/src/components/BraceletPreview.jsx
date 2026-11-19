import { useRef, useState } from 'react'
import './bracelet-preview.css'

const TRACK_START = 48
const TRACK_END = 312
const clamp = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
const trackPoint = (position) => {
  const t = clamp(position)
  return { x: TRACK_START + (TRACK_END - TRACK_START) * t, y: 171 + 37 * (1 - ((2 * t) - 1) ** 2) }
}

export default function BraceletPreview({ stones, thread, charm, metal, onMove, onSelect, svgRef: externalSvgRef }) {
  const internalSvgRef = useRef(null)
  const svgRef = externalSvgRef || internalSvgRef
  const dragRef = useRef(null)
  const dragStartX = useRef(0)
  const suppressClick = useRef(false)
  const [draggingKey, setDraggingKey] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const positionedElements = [
    ...stones.map((stone) => ({ key: stone.instanceId, kind: 'stone', item: stone })),
    ...(charm ? [{ key: 'charm', kind: 'charm', item: charm }] : []),
    ...(metal ? [{ key: 'metal', kind: 'metal', item: metal }] : []),
  ].sort((a, b) => a.item.position - b.item.position || a.key.localeCompare(b.key))
  const moveToPointer = (event) => {
    if (!dragRef.current || !svgRef.current || !Number.isFinite(event.clientX)) return
    const rect = svgRef.current.getBoundingClientRect()
    if (!rect.width) return
    const x = ((event.clientX - rect.left) / rect.width) * 360
    if (Math.abs(event.clientX - dragStartX.current) > 2) suppressClick.current = true
    onMove(dragRef.current, clamp((x - TRACK_START) / (TRACK_END - TRACK_START)))
  }
  const startDrag = (event, key) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    dragRef.current = key
    dragStartX.current = event.clientX
    suppressClick.current = false
    setDraggingKey(key)
    event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId)
  }
  const endDrag = (event) => {
    if (!dragRef.current) return
    moveToPointer(event)
    const key = dragRef.current
    const wasTap = !suppressClick.current
    dragRef.current = null
    setDraggingKey(null)
    suppressClick.current = false
    if (wasTap) {
      const element = positionedElements.find((candidate) => candidate.key === key)
      if (element) {
        setSelectedKey(element.key)
        onSelect(element.key, element.kind, false)
      }
    }
  }
  const cancelDrag = () => {
    dragRef.current = null
    setDraggingKey(null)
    suppressClick.current = false
  }
  const onKeyDown = (event, element) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      onMove(element.key, clamp(element.item.position + (event.key === 'ArrowRight' ? 0.02 : -0.02)))
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onSelect(element.key, element.kind, true)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(element.key, element.kind, false)
    }
  }
  return <div className="bracelet-preview" aria-label="Vista previa de tu manilla">
    <svg ref={svgRef} viewBox="0 0 360 270" role="group" aria-label={`Manilla con ${stones.length} piedras`} onPointerMove={moveToPointer} onPointerUp={endDrag} onPointerCancel={cancelDrag}>
      <defs>
        <linearGradient id="cord" x1="0" y1="0" x2="1" y2="0"><stop stopColor={thread} /><stop offset=".5" stopColor="#806744" stopOpacity=".45" /><stop offset="1" stopColor={thread} /></linearGradient>
        <radialGradient id="gem"><stop offset="0" stopColor="#fff" stopOpacity=".8" /><stop offset=".48" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#33251e" stopOpacity=".22" /></radialGradient>
      </defs>
      <path d="M48 171 C18 143 29 103 100 83 C127 75 148 84 164 99" fill="none" stroke="url(#cord)" strokeWidth="6" strokeLinecap="round" />
      <path d="M312 171 C342 143 331 103 260 83 C233 75 212 84 196 99" fill="none" stroke="url(#cord)" strokeWidth="6" strokeLinecap="round" />
      <path d="M164 99 C155 95 148 91 139 89m57 10c9-4 16-8 25-10" fill="none" stroke="url(#cord)" strokeWidth="4" strokeLinecap="round" />
      <path d="M48 171 C88 200 117 208 180 208 C243 208 272 200 312 171" fill="none" stroke={thread} strokeWidth="30" strokeLinecap="round" />
      <path d="M48 171 C88 200 117 208 180 208 C243 208 272 200 312 171" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
      <path d="M165 93 C169 88 191 88 195 93 L195 103 C191 108 169 108 165 103Z" fill={thread} stroke="#6f5940" strokeWidth="1.5" />
      <path d="M169 94v8m5-9v10m5-10v10m5-10v10m5-9v8" stroke="#fff" strokeOpacity=".4" strokeWidth="1" />
      {positionedElements.map((element) => {
        const { x, y } = trackPoint(element.item.position)
        const siblings = positionedElements.filter((candidate) => candidate.item.position === element.item.position)
        const overlapOffset = siblings.length > 1 ? (siblings.indexOf(element) - (siblings.length - 1) / 2) * 9 : 0
        const selected = selectedKey === element.key
        const draggableProps = {
          tabIndex: 0,
          role: 'button',
          'aria-label': element.kind === 'stone' ? `Piedra ${stones.findIndex((stone) => stone.instanceId === element.item.instanceId) + 1}: ${element.item.name || 'piedra'}, mover o editar` : element.kind === 'charm' ? `Dije ${element.item.name}, mover o quitar` : `Bola metálica ${element.item.name}, mover o quitar`,
          className: `preview-element preview-${element.kind}${draggingKey === element.key ? ' is-dragging' : ''}${selected ? ' is-selected' : ''}`,
          onPointerDown: (event) => startDrag(event, element.key),
          onKeyDown: (event) => onKeyDown(event, element),
        }
        if (element.kind !== 'metal') return <g key={element.key} {...draggableProps}>
          {element.item.image && <image href={element.item.image} x={x - 15} y={y + overlapOffset - 15} width="30" height="30" preserveAspectRatio="xMidYMid meet" />}
          <circle cx={x} cy={y + overlapOffset} r="19" fill="transparent" />
        </g>
        const clipId = `clip-${element.key}`
        return <g key={element.key} {...draggableProps}>
          <defs><clipPath id={clipId}><circle cx={x} cy={y + overlapOffset} r="10" /></clipPath></defs>
          {element.item.image && <image href={element.item.image} x={x - 10} y={y + overlapOffset - 10} width="20" height="20" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />}
          <circle cx={x} cy={y + overlapOffset} r="17" fill="transparent" />
        </g>
      })}
    </svg>
    {!stones.length && !charm && !metal && <p className="preview-note">Tus piedras aparecerán aquí</p>}
  </div>
}
