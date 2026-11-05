import { useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CHARMS as DEFAULT_CHARMS, CONFIG as DEFAULT_CONFIG, METALS as DEFAULT_METALS, STONES as DEFAULT_STONES, THREADS as DEFAULT_THREADS, WEAVES as DEFAULT_WEAVES } from '../data/catalog'
import { braceletPrice, formatPrice } from '../lib/commerce'
import { loadDesignerOptions } from '../lib/supabase'
import BraceletPreview from './BraceletPreview'

function SortableStone({ stone, index, onChange, onColorChange, onRemove, stoneOptions }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stone.instanceId })
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }} className="stone-row">
    <button className="drag-handle" aria-label={`Reordenar piedra ${index + 1}`} {...attributes} {...listeners}>⠿</button>
    <select aria-label={`Tipo de piedra ${index + 1}`} value={stone.stoneId} onChange={(event) => onChange(stone.instanceId, event.target.value)}>
      {stoneOptions.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatPrice(item.price)}</option>)}
    </select>
    <button type="button" className="mini-swatch" aria-label={`Cambiar color piedra ${index + 1}`} title="Cambiar color" style={{ '--swatch': stone.color || stoneOptions.find((item) => item.id === stone.stoneId)?.color }} onClick={() => onColorChange(stone.instanceId)} />
    <button className="remove-stone" aria-label={`Quitar piedra ${index + 1}`} onClick={() => onRemove(stone.instanceId)}>×</button>
  </li>
}

export default function BraceletDesigner({ onAdd }) {
  const nextId = useRef(1)
  const [options, setOptions] = useState({ config: DEFAULT_CONFIG, stones: DEFAULT_STONES, threads: DEFAULT_THREADS, weaves: DEFAULT_WEAVES, charms: DEFAULT_CHARMS, metals: DEFAULT_METALS })
  const { config, stones: stoneOptions, threads, weaves, charms, metals } = options
  const [weave, setWeave] = useState(DEFAULT_WEAVES[0])
  const [thread, setThread] = useState(DEFAULT_THREADS[0])
  useEffect(() => { loadDesignerOptions().then((result) => { if (result) { setOptions(result); setWeave(result.weaves[0] || DEFAULT_WEAVES[0]); setThread(result.threads[0] || DEFAULT_THREADS[0]) } }).catch(() => {}) }, [])
  const [stones, setStones] = useState([])
  const [charm, setCharm] = useState('')
  const [metal, setMetal] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }))
  const fullConfiguration = {
    weave, thread: thread.name, threadColor: thread.color,
    stones: stones.map((selection) => {
      const item = stoneOptions.find((stone) => stone.id === selection.stoneId) || stoneOptions[0]
      return { ...selection, name: item?.name || 'Piedra', color: selection.color || item?.color || '#b28d4f' }
    }), charm,     charmName: charms.find((item) => item.id === charm)?.name || '',
        metal, metalName: metals.find((item) => item.id === metal)?.name || '',
  }
  const total = braceletPrice({ stones, metalId: metal }, config, stoneOptions, metals)
  const addStone = (stoneId) => {
    if (stones.length >= config.maxStones) return
    const selectedStone = stoneOptions.find((stone) => stone.id === stoneId)
    setStones((current) => [...current, { instanceId: `stone-${nextId.current++}`, stoneId, color: selectedStone?.colors?.[0] || selectedStone?.color }])
  }
  const changeStone = (instanceId, stoneId) => {
    const selectedStone = stoneOptions.find((stone) => stone.id === stoneId)
    setStones((current) => current.map((stone) => stone.instanceId === instanceId ? { ...stone, stoneId, color: selectedStone?.colors?.[0] || selectedStone?.color } : stone))
  }
  const changeStoneColor = (instanceId) => setStones((current) => current.map((stone) => {
    if (stone.instanceId !== instanceId) return stone
    const colors = stoneOptions.find((item) => item.id === stone.stoneId)?.colors || []
    const currentIndex = colors.indexOf(stone.color)
    return { ...stone, color: colors[(currentIndex + 1) % colors.length] || stone.color }
  }))
  const removeStone = (instanceId) => setStones((current) => current.filter((stone) => stone.instanceId !== instanceId))
  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) setStones((current) => arrayMove(current, current.findIndex((stone) => stone.instanceId === active.id), current.findIndex((stone) => stone.instanceId === over.id)))
  }
  return <section className="section designer-section" id="crear">
    <div className="section-heading"><span className="eyebrow">HECHA A TU MANERA</span><h2>Diseña tu manilla</h2><p>Elige tus tonos, suma piedras y acomódalas a tu gusto. El precio se actualiza contigo.</p></div>
    <div className="designer-card">
      <div className="designer-visual"><BraceletPreview stones={fullConfiguration.stones} thread={thread.color} charm={charm} metal={metals.find((item) => item.id === metal)?.color} /><div className="price-pill"><span>Tu diseño</span><strong>{formatPrice(total)}</strong></div></div>
      <div className="designer-controls">
        <fieldset><legend>1. Elige el tejido</legend><div className="choice-buttons">{weaves.map((item) => <button type="button" key={item} className={`choice-button${weave === item ? ' selected' : ''}`} onClick={() => setWeave(item)}>{item}</button>)}</div></fieldset>
        <fieldset><legend>2. Color del hilo</legend><div className="swatches">{threads.map((item) => <button type="button" key={item.name} className={`swatch${thread.name === item.name ? ' selected' : ''}`} style={{ '--swatch': item.color }} aria-label={item.name} title={item.name} onClick={() => setThread(item)} />)}</div><span className="selection-note">{thread.name}</span></fieldset>
        <fieldset><legend>3. Agrega piedras <small>({stones.length}/{config.maxStones}; mínimo {config.minStones})</small></legend><div className="stone-picker">{stoneOptions.map((item) => <button type="button" key={item.id} disabled={stones.length >= config.maxStones} onClick={() => addStone(item.id)}><span style={{ backgroundColor: item.color }} />{item.name}<small>+{formatPrice(item.price)}</small></button>)}</div>
          {stones.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={stones.map((stone) => stone.instanceId)} strategy={verticalListSortingStrategy}><ol className="stone-list">{stones.map((stone, index) => <SortableStone key={stone.instanceId} stone={stone} index={index} onChange={changeStone} onColorChange={changeStoneColor} onRemove={removeStone} stoneOptions={stoneOptions} />)}</ol></SortableContext></DndContext>}
        </fieldset>
        <div className="option-grid"><fieldset><legend>4. Dije <small>· incluido</small></legend><select aria-label="Dije" value={charm} onChange={(event) => setCharm(event.target.value)}><option value="">Sin dije</option>{charms.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select></fieldset>
          <fieldset><legend>5. Bola metálica</legend><select aria-label="Bola metálica" value={metal} onChange={(event) => setMetal(event.target.value)}><option value="">Sin bola</option>{metals.map((item) => <option key={item.id} value={item.id}>{item.name} · +{formatPrice(item.price)}</option>)}</select></fieldset></div>
        <button type="button" className="button button-primary add-custom" disabled={stones.length < config.minStones} onClick={() => onAdd(fullConfiguration, total)}>{stones.length < config.minStones ? `Agrega ${config.minStones - stones.length} piedra${config.minStones - stones.length === 1 ? '' : 's'} más` : 'Agregar mi diseño al carrito'} <span aria-hidden="true">→</span></button>
        <p className="fine-print">La base incluye el tejido y el dije. El precio de las piedras y la bola se suma individualmente. Puedes arrastrar las piedras para cambiar su orden.</p>
      </div>
    </div>
  </section>
}
