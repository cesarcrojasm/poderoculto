import { useEffect, useRef, useState } from 'react'
import { CHARMS as DEFAULT_CHARMS, CONFIG as DEFAULT_CONFIG, METALS as DEFAULT_METALS, STONES as DEFAULT_STONES, THREADS as DEFAULT_THREADS, WEAVES as DEFAULT_WEAVES } from '../data/catalog'
import { repositionBraceletElement } from '../lib/braceletLayout'
import { braceletPrice, formatPrice, makeOrderMessage, whatsappUrl } from '../lib/commerce'
import { loadDesignerOptions } from '../lib/supabase'
import { createDesignPng, downloadDesignPng } from '../lib/shareDesign'
import BraceletPreview from './BraceletPreview'

export default function BraceletDesigner({ onAdd }) {
  const nextId = useRef(1)
  const svgRef = useRef(null)
  const [options, setOptions] = useState({ config: DEFAULT_CONFIG, stones: DEFAULT_STONES, threads: DEFAULT_THREADS, weaves: DEFAULT_WEAVES, charms: DEFAULT_CHARMS, metals: DEFAULT_METALS })
  const { config, stones: stoneOptions, threads, weaves, charms, metals } = options
  const [weave, setWeave] = useState(DEFAULT_WEAVES[0])
  const [thread, setThread] = useState(DEFAULT_THREADS[0])
  useEffect(() => { loadDesignerOptions().then((result) => { if (result) { setOptions(result); setWeave(result.weaves[0] || DEFAULT_WEAVES[0]); setThread(result.threads[0] || DEFAULT_THREADS[0]) } }).catch(() => {}) }, [])
  const [stones, setStones] = useState([])
  const [charm, setCharm] = useState(null)
  const [metal, setMetal] = useState(null)
  const [selectedElement, setSelectedElement] = useState(null)
  const [shareStatus, setShareStatus] = useState('')
  useEffect(() => {
    if (!selectedElement) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSelectedElement(null) }
    const closeOnOutsideClick = (event) => {
      if (!event.target.closest('.element-editor, .preview-element')) setSelectedElement(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [selectedElement])
  const fullConfiguration = {
    weave, thread: thread.name, threadColor: thread.color,
    stones: [...stones].sort((a, b) => a.position - b.position).map((selection) => {
      const item = stoneOptions.find((stone) => stone.id === selection.stoneId) || stoneOptions[0]
      return { ...selection, name: item?.name || 'Piedra', image: item?.image || '' }
    }),
    charm: charm?.id || '', charmName: charms.find((item) => item.id === charm?.id)?.name || '', charmPosition: charm?.position ?? 0.5,
    charmImage: charms.find((item) => item.id === charm?.id)?.image || '',
    metal: metal?.id || '', metalName: metals.find((item) => item.id === metal?.id)?.name || '', metalPosition: metal?.position ?? 0.5,
  }
  const total = braceletPrice({ stones, metalId: metal?.id || '', charmId: charm?.id || '' }, config, stoneOptions, metals, charms)
  const addStone = (stoneId) => {
    if (stones.length >= config.maxStones) return
    setStones((current) => [...current, { instanceId: `stone-${nextId.current++}`, stoneId, position: 0.5 }])
  }
  const changeStone = (instanceId, stoneId) => setStones((current) => current.map((stone) => stone.instanceId === instanceId ? { ...stone, stoneId } : stone))
  const removeStone = (instanceId) => {
    setStones((current) => current.filter((stone) => stone.instanceId !== instanceId))
    setSelectedElement(null)
  }
  const allElements = [
    ...stones.map((stone) => ({ key: stone.instanceId, position: stone.position })),
    ...(charm ? [{ key: 'charm', position: charm.position }] : []),
    ...(metal ? [{ key: 'metal', position: metal.position }] : []),
  ]
  const moveElement = (key, position) => {
    const repositioned = repositionBraceletElement(allElements, key, position)
    setStones((current) => current.map((stone) => ({ ...stone, position: repositioned.find((element) => element.key === stone.instanceId)?.position ?? stone.position })))
    const nextCharmPosition = repositioned.find((element) => element.key === 'charm')?.position
    const nextMetalPosition = repositioned.find((element) => element.key === 'metal')?.position
    if (nextCharmPosition !== undefined) setCharm((current) => current ? { ...current, position: nextCharmPosition } : current)
    if (nextMetalPosition !== undefined) setMetal((current) => current ? { ...current, position: nextMetalPosition } : current)
  }
  const selectElement = (key, kind, remove = false) => {
    if (remove) {
      if (kind === 'stone') removeStone(key)
      else if (kind === 'charm') { setCharm(null); setSelectedElement(null) }
      else if (kind === 'metal') { setMetal(null); setSelectedElement(null) }
      return
    }
    setSelectedElement({ key, kind })
  }
  const removeSelectedElement = () => {
    if (!selectedElement) return
    selectElement(selectedElement.key, selectedElement.kind, true)
  }
  const selectCharm = (value) => {
    setCharm(value ? { id: value, position: charm?.position ?? 0.5 } : null)
    if (selectedElement?.kind === 'charm') setSelectedElement(null)
  }
  const selectMetal = (value) => {
    setMetal(value ? { id: value, position: metal?.position ?? 0.5 } : null)
    if (selectedElement?.kind === 'metal') setSelectedElement(null)
  }
  const shareDesign = async () => {
    setShareStatus('')
    try {
      const image = await createDesignPng(svgRef.current)
      const caption = `Mira el diseño de mi manilla personalizada — Total: ${formatPrice(total)}.`
      if (navigator.canShare?.({ files: [image] }) && navigator.share) {
        await navigator.share({ files: [image], text: caption, title: 'Mi manilla personalizada' })
        setShareStatus('Diseño compartido. Elige WhatsApp y el chat de Poder Oculto.')
        return
      }
      downloadDesignPng(image)
      const cartItem = { type: 'custom', name: 'Manilla personalizada', price: total, quantity: 1, configuration: fullConfiguration }
      window.open(whatsappUrl(import.meta.env.VITE_WHATSAPP_NUMBER || '573214411674', makeOrderMessage([cartItem], total)), '_blank', 'noopener,noreferrer')
      setShareStatus('Descargamos la imagen y abrimos WhatsApp con el detalle. Adjunta la imagen para compartir tu diseño.')
    } catch (error) {
      if (error.name !== 'AbortError') setShareStatus('No fue posible compartir el diseño. Intenta de nuevo.')
    }
  }
  return <section className="section designer-section" id="crear">
    <div className="section-heading"><span className="eyebrow">HECHA A TU MANERA</span><h2>Diseña tu manilla</h2><p>Elige tus tonos, suma piedras y acomódalas a tu gusto. El precio se actualiza contigo.</p></div>
    <div className="designer-card">
      <div className="designer-visual">
        <BraceletPreview svgRef={svgRef} stones={fullConfiguration.stones} thread={thread.color} charm={charm ? { ...charm, name: fullConfiguration.charmName, image: fullConfiguration.charmImage } : null} metal={metal ? { ...metal, name: fullConfiguration.metalName, image: metals.find((item) => item.id === metal.id)?.image } : null} onMove={moveElement} onSelect={selectElement} />
        <div className="price-pill"><span>Tu diseño</span><strong>{formatPrice(total)}</strong></div>
        {selectedElement && <div className="element-editor" role="group" aria-label={selectedElement.kind === 'stone' ? 'Editar piedra seleccionada' : selectedElement.kind === 'charm' ? 'Editar dije seleccionado' : 'Editar bola metálica seleccionada'}>
          <strong className="element-editor-title">{selectedElement.kind === 'stone' ? 'Editar piedra seleccionada' : selectedElement.kind === 'charm' ? 'Editar dije seleccionado' : 'Editar bola metálica seleccionada'}</strong>
          {selectedElement.kind === 'stone' && <label>Tipo de piedra<select aria-label="Tipo de piedra seleccionada" value={stones.find((stone) => stone.instanceId === selectedElement.key)?.stoneId || ''} onChange={(event) => { changeStone(selectedElement.key, event.target.value); setSelectedElement(null) }}>{stoneOptions.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatPrice(item.price)}</option>)}</select></label>}
          <button type="button" className="button button-danger button-small" onClick={removeSelectedElement}>Quitar {selectedElement.kind === 'stone' ? 'piedra' : selectedElement.kind === 'charm' ? 'dije' : 'bola metálica'}</button>
          <button type="button" className="icon-button" aria-label="Cerrar controles de pieza" onClick={() => setSelectedElement(null)}>×</button>
        </div>}
      </div>
      <div className="designer-controls">
        <fieldset><legend>1. Elige el tejido</legend><div className="choice-buttons">{weaves.map((item) => <button type="button" key={item} className={`choice-button${weave === item ? ' selected' : ''}`} onClick={() => setWeave(item)}>{item}</button>)}</div></fieldset>
        <fieldset><legend>2. Color del hilo</legend><div className="swatches">{threads.map((item) => <button type="button" key={item.name} className={`swatch${thread.name === item.name ? ' selected' : ''}`} style={{ '--swatch': item.color }} aria-label={item.name} title={item.name} onClick={() => setThread(item)} />)}</div><span className="selection-note">{thread.name}</span></fieldset>
        <fieldset><legend>3. Agrega piedras <small>({stones.length}/{config.maxStones}; mínimo {config.minStones})</small></legend><div className="stone-picker">{stoneOptions.map((item) => <button type="button" key={item.id} disabled={stones.length >= config.maxStones} onClick={() => addStone(item.id)}><img src={item.image} alt="" />{item.name}<small>+{formatPrice(item.price)}</small></button>)}</div>
          {(stones.length > 0 || charm || metal) && <p className="fine-print">Toca cualquier pieza en el dibujo para quitarla; toca una piedra para cambiar su tipo.</p>}
        </fieldset>
        <div className="option-grid"><fieldset><legend>4. Dije</legend><select aria-label="Dije" value={charm?.id || ''} onChange={(event) => selectCharm(event.target.value)}><option value="">Sin dije</option>{charms.map((item) => <option key={item.id} value={item.id}>{item.name} · +{formatPrice(item.price)}</option>)}</select></fieldset>
          <fieldset><legend>5. Bola metálica</legend><select aria-label="Bola metálica" value={metal?.id || ''} onChange={(event) => selectMetal(event.target.value)}><option value="">Sin bola</option>{metals.map((item) => <option key={item.id} value={item.id}>{item.name} · +{formatPrice(item.price)}</option>)}</select></fieldset></div>
        <div className="designer-action-buttons"><button type="button" className="button button-primary add-custom" disabled={stones.length < config.minStones} onClick={() => onAdd(fullConfiguration, total)}>{stones.length < config.minStones ? `Agrega ${config.minStones - stones.length} piedra${config.minStones - stones.length === 1 ? '' : 's'} más` : 'Agregar mi diseño al carrito'} <span aria-hidden="true">→</span></button><button type="button" className="button button-outline share-design" onClick={shareDesign}>Compartir mi diseño <span aria-hidden="true">↗</span></button></div>
        {shareStatus && <p className="form-status" role="status">{shareStatus}</p>}
        <p className="fine-print">Haz tu propia edición limitada: una sola unidad, hecha exactamente como la soñaste. El precio de las piedras, el dije y la bola se suma individualmente. Arrastra las piezas del dibujo para acomodarlas en la banda.</p>
      </div>
    </div>
  </section>
}
