export const CATEGORIES = [
  { id: 'clasica', nombre: 'Clásica' },
  { id: 'colombiana', nombre: 'Colombiana' },
]

export const PRODUCTS = [
  { id: '1', name: 'Raíz carmesí', description: 'Macramé rojo y piedras en tonos cálidos: un pequeño recordatorio de fuerza, arraigo y nuevos comienzos.', price: 20000, categoryId: 'clasica', images: ['/products/1.1.jpeg', '/products/1.2.jpeg'] },
  { id: '2', name: 'Lazo de calma', description: 'Hilo rojo tejido a mano con cuentas rosadas suaves. Un detalle delicado para llevar cerca lo que te da tranquilidad.', price: 10000, categoryId: 'clasica', images: ['/products/2.1.jpeg', '/products/2.2.jpeg'] },
  { id: '3', name: 'Cruz de marea', description: 'Azul profundo, cuentas claras y una cruz turquesa que evoca calma, confianza y protección.', price: 20000, categoryId: 'clasica', images: ['/products/3.1.jpeg', '/products/3.2.jpeg'] },
  { id: '4', name: 'Luz de luna', description: 'El rojo del macramé contrasta con una piedra central luminosa y detalles transparentes. Hecha para destacar sin esfuerzo.', price: 15000, categoryId: 'clasica', images: ['/products/4.1.jpeg', '/products/4.2.jpeg'] },
  { id: '5', name: 'Amuleto de plata', description: 'Una silueta negra y sobria con una cruz plateada al centro. Un clásico artesanal para todos los días.', price: 50000, categoryId: 'clasica', images: ['/products/5.1.jpeg', '/products/5.2.jpeg'] },
  { id: '6', name: 'Corazón de camino', description: 'Hilo rojo, corazón claro y pequeños acentos turquesa: una pieza que celebra los vínculos que nos acompañan.', price: 20000, categoryId: 'clasica', images: ['/products/6.jpeg'] },
  { id: '7', name: 'Turquesa protectora', description: 'Macramé azul noche y una cruz turquesa rodeada de cuentas azules. Color y carácter en una pieza hecha a mano.', price: 30000, categoryId: 'clasica', images: ['/products/7.jpeg'] },
  { id: 'colombia-heart', name: 'Corazón tricolor', description: 'Macramé negro con cuentas de colores y un corazón con la bandera colombiana: un símbolo de cariño por nuestra tierra.', price: 20000, categoryId: 'colombiana', images: ['/colombia/colombia-heart.jpeg'] },
  { id: 'colombia-red', name: 'Raíces de Colombia', description: 'Hilo rojo tejido a mano con cuentas amarillas, azules y rojas, inspirado en los colores que nos unen.', price: 20000, categoryId: 'colombiana', images: ['/colombia/colombia-red.jpeg'] },
  { id: 'colombia-black', name: 'Orgullo tricolor', description: 'Macramé negro con cuentas en amarillo, azul y rojo: un diseño artesanal para llevar a Colombia contigo.', price: 20000, categoryId: 'colombiana', images: ['/colombia/colombia-black.jpeg'] },
  { id: 'colombia-upright', name: 'Camino colombiano', description: 'Tejido negro con una cuenta central tricolor y pequeños detalles de color, hecho a mano con inspiración colombiana.', price: 20000, categoryId: 'colombiana', images: ['/colombia/colombia-upright.jpeg'] },
]

export const CONFIG = { basePrice: 18000, minStones: 3, maxStones: 10 }

export const STONES = [
  { id: 'cuarzo-rosa', name: 'Cuarzo rosa', price: 3000, image: '/personalizacion/piedras/cuarzo-rosa.svg' },
  { id: 'ojo-tigre', name: 'Ojo de tigre', price: 3500, image: '/personalizacion/piedras/ojo-tigre.svg' },
  { id: 'amatista', name: 'Amatista', price: 4000, image: '/personalizacion/piedras/amatista.svg' },
  { id: 'aventurina', name: 'Aventurina', price: 3000, image: '/personalizacion/piedras/aventurina.svg' },
  { id: 'howlita', name: 'Howlita', price: 2500, image: '/personalizacion/piedras/howlita.svg' },
]

export const THREADS = [
  { name: 'Rojo', color: '#9b2928' }, { name: 'Negro', color: '#282522' },
  { name: 'Azul noche', color: '#263b70' }, { name: 'Crema', color: '#d7c8a7' },
  { name: 'Verde jade', color: '#47816d' }, { name: 'Vino', color: '#672c43' },
]
export const WEAVES = ['Macramé clásico', 'Trenzado']
export const CHARMS = [{ id: 'corazon', name: 'Corazón', price: 10000, image: '/personalizacion/dijes/corazon.svg' }, { id: 'cruz', name: 'Cruz', price: 10000, image: '/personalizacion/dijes/cruz.svg' }]
export const METALS = [{ id: 'plata', name: 'Plata', price: 4000, image: '/personalizacion/bolas/plata.svg' }, { id: 'oro', name: 'Oro', price: 5000, image: '/personalizacion/bolas/oro.svg' }]
