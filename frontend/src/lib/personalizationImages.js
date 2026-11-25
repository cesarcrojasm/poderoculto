const STONE_IMAGES = {
  'aventurina': 'aventurina.svg',
  'aventurina verde': 'aventurina.svg',
  'amatista': 'amatista.svg',
  'ojo tigre': 'ojo-tigre.svg',
  'ojo de tigre': 'ojo-tigre.svg',
  'cuarzo rosa': 'cuarzo-rosa.svg',
  'coralina': 'coralina.svg',
  'jaspe amarillo': 'jaspe-amarillo.svg',
  'jaspe rojo': 'jaspe-rojo.svg',
  'turquesa': 'turquesa.svg',
  'obsidiana negra': 'obsidiana-negra.svg',
  'cuenta traslucida': 'cuenta-translucida.svg',
  'cuenta negra': 'cuenta-negra.svg',
  'cuenta roja': 'cuenta-roja.svg',
  'cuenta naranja': 'cuenta-naranja.svg',
  'cuenta amarilla': 'cuenta-amarilla.svg',
  'cuenta verde': 'cuenta-verde.svg',
  'cuenta azul celeste': 'cuenta-azul-celeste.svg',
  'cuenta azul rey': 'cuenta-azul-rey.svg',
  'cuenta lila': 'cuenta-lila.svg',
}

const METAL_IMAGES = { plata: 'plata.svg', oro: 'oro.svg' }

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export function personalizationImage(kind, id, name, uploadedUrl) {
  const images = kind === 'piedras' ? STONE_IMAGES : kind === 'bolas' ? METAL_IMAGES : null
  if (!images) return uploadedUrl || ''

  const file = images[normalize(id)] || images[normalize(name)]
  return file ? `/personalizacion/${kind}/${file}` : uploadedUrl || `/personalizacion/${kind}/${id}.svg`
}
