export const PRODUCTS = [
  { id: '1', name: 'Raíz carmesí', description: 'Macramé rojo y piedras en tonos cálidos: un pequeño recordatorio de fuerza, arraigo y nuevos comienzos.', price: 20000, images: ['/products/1.1.jpeg', '/products/1.2.jpeg'] },
  { id: '2', name: 'Lazo de calma', description: 'Hilo rojo tejido a mano con cuentas rosadas suaves. Un detalle delicado para llevar cerca lo que te da tranquilidad.', price: 10000, images: ['/products/2.1.jpeg', '/products/2.2.jpeg'] },
  { id: '3', name: 'Cruz de marea', description: 'Azul profundo, cuentas claras y una cruz turquesa que evoca calma, confianza y protección.', price: 20000, images: ['/products/3.1.jpeg', '/products/3.2.jpeg'] },
  { id: '4', name: 'Luz de luna', description: 'El rojo del macramé contrasta con una piedra central luminosa y detalles transparentes. Hecha para destacar sin esfuerzo.', price: 15000, images: ['/products/4.1.jpeg', '/products/4.2.jpeg'] },
  { id: '5', name: 'Amuleto de plata', description: 'Una silueta negra y sobria con una cruz plateada al centro. Un clásico artesanal para todos los días.', price: 50000, images: ['/products/5.1.jpeg', '/products/5.2.jpeg'] },
  { id: '6', name: 'Corazón de camino', description: 'Hilo rojo, corazón claro y pequeños acentos turquesa: una pieza que celebra los vínculos que nos acompañan.', price: 20000, images: ['/products/6.jpeg'] },
  { id: '7', name: 'Turquesa protectora', description: 'Macramé azul noche y una cruz turquesa rodeada de cuentas azules. Color y carácter en una pieza hecha a mano.', price: 30000, images: ['/products/7.jpeg'] },
]

export const CONFIG = { basePrice: 18000, minStones: 3, maxStones: 10 }

export const STONES = [
  { id: 'cuarzo-rosa', name: 'Cuarzo rosa', price: 3000, color: '#d890a0', colors: ['#d890a0', '#f0c6ce'] },
  { id: 'ojo-tigre', name: 'Ojo de tigre', price: 3500, color: '#a96532', colors: ['#a96532', '#6d3e24'] },
  { id: 'amatista', name: 'Amatista', price: 4000, color: '#8e71a9', colors: ['#8e71a9', '#c6aade'] },
  { id: 'aventurina', name: 'Aventurina', price: 3000, color: '#5b8b66', colors: ['#5b8b66', '#a2b98b'] },
  { id: 'howlita', name: 'Howlita', price: 2500, color: '#e7e0d4', colors: ['#e7e0d4', '#8cb9c2'] },
]

export const THREADS = [
  { name: 'Rojo', color: '#9b2928' }, { name: 'Negro', color: '#282522' },
  { name: 'Azul noche', color: '#263b70' }, { name: 'Crema', color: '#d7c8a7' },
  { name: 'Verde jade', color: '#47816d' }, { name: 'Vino', color: '#672c43' },
]
export const WEAVES = ['Macramé clásico', 'Trenzado']
export const CHARMS = [{ id: 'corazon', name: 'Corazón', icon: '♡' }, { id: 'cruz', name: 'Cruz', icon: '✚' }]
export const METALS = [{ id: 'plata', name: 'Plata', price: 4000, color: '#bbc0c2' }, { id: 'oro', name: 'Oro', price: 5000, color: '#caa34a' }]
