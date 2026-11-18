import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { CATEGORIES, PRODUCTS } from './data/catalog'
import { cartTotal, formatPrice, makeOrderMessage, readCart, whatsappUrl } from './lib/commerce'
import { hasSupabase, loadCategories, loadProducts } from './lib/supabase'
import Brand from './components/Brand'
import ProductCard from './components/ProductCard'
import BraceletDesigner from './components/BraceletDesigner'
const Admin = lazy(() => import('./components/Admin'))

const WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || '573214411674'
const COLOMBIA_PRODUCTS = PRODUCTS.filter((product) => product.id.startsWith('colombia-'))
const categoryFromUrl = () => new URLSearchParams(window.location.search).get('categoria') || ''

function CartDrawer({ items, setItems, onClose }) {
  const [status, setStatus] = useState('')
  const total = cartTotal(items)
  const updateQuantity = (cartId, quantity) => setItems((current) => current.map((item) => item.cartId === cartId ? { ...item, quantity: Math.max(1, quantity) } : item))
  const removeItem = (cartId) => setItems((current) => current.filter((item) => item.cartId !== cartId))
  const submitOrder = () => {
    const message = makeOrderMessage(items, total)
    window.open(whatsappUrl(WHATSAPP, message), '_blank', 'noopener,noreferrer')
    setStatus('WhatsApp se abrió con los detalles de tu pedido. Envíalo allí para confirmar.')
    setItems([])
  }
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
    <div className="drawer-heading"><div><span className="eyebrow">TU SELECCIÓN</span><h2 id="cart-title">Carrito</h2></div><button className="icon-button" aria-label="Cerrar carrito" onClick={onClose}>×</button></div>
    {!items.length ? <div className="empty-cart"><span>✧</span><p>{status || 'Aún no hay piezas en tu carrito.'}</p><button className="button button-dark" onClick={onClose}>Seguir explorando</button></div> : <>
      <ul className="cart-items">{items.map((item) => <li key={item.cartId} className="cart-item">
        <div className="cart-thumb">{item.type === 'custom' ? <span>✧</span> : <img src={item.image} alt="" />}</div>
        <div className="cart-item-copy"><strong>{item.name}</strong>{item.type === 'custom' && <small>{item.configuration.stones.length} piedras · {item.configuration.thread} · {item.configuration.weave}</small>}<span>{formatPrice(item.price)}</span>
          {item.type !== 'custom' && <div className="quantity-control"><button aria-label={`Reducir ${item.name}`} onClick={() => updateQuantity(item.cartId, item.quantity - 1)}>−</button><span>{item.quantity}</span><button aria-label={`Aumentar ${item.name}`} onClick={() => updateQuantity(item.cartId, item.quantity + 1)}>＋</button></div>}
        </div><button className="remove-item" aria-label={`Quitar ${item.name}`} onClick={() => removeItem(item.cartId)}>Quitar</button>
      </li>)}</ul>
      <div className="cart-total"><span>Total estimado</span><strong>{formatPrice(total)}</strong></div>
      <div className="checkout-form"><p>Continúa a WhatsApp para revisar y enviar los detalles de tus piezas. El pedido se confirma al enviar el mensaje.</p>
        <button className="button button-primary full-width" type="button" onClick={submitOrder}>Continuar por WhatsApp <span aria-hidden="true">↗</span></button>
      </div>
    </>}
  </aside></div>
}

function Storefront() {
  const [products, setProducts] = useState(PRODUCTS)
  const [cart, setCart] = useState(readCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loadMessage, setLoadMessage] = useState('')
  const [categories, setCategories] = useState(CATEGORIES)
  const [activeCategoryId, setActiveCategoryId] = useState(categoryFromUrl)
  useEffect(() => { localStorage.setItem('poder-oculto-cart', JSON.stringify(cart)) }, [cart])
  useEffect(() => {
    let mounted = true
    loadProducts().then((result) => {
      if (mounted && result) {
        const productsById = new Map(result.map((product) => [product.id, product]))
        COLOMBIA_PRODUCTS.forEach((product) => { if (!productsById.has(product.id)) productsById.set(product.id, product) })
        setProducts([...productsById.values()])
      }
    }).catch(() => { if (mounted) setLoadMessage('Mostrando el catálogo de muestra. Revisa la conexión de Supabase.') })
    loadCategories().then((result) => { if (mounted && result) setCategories(result) }).catch(() => { if (mounted) setLoadMessage('Mostrando categorías de muestra. Revisa la conexión de Supabase.') })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    const syncCategoryFromUrl = () => setActiveCategoryId(categoryFromUrl())
    window.addEventListener('popstate', syncCategoryFromUrl)
    return () => window.removeEventListener('popstate', syncCategoryFromUrl)
  }, [])
  useEffect(() => {
    if (activeCategoryId && categories.length && !categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId('')
      const url = new URL(window.location.href)
      url.searchParams.delete('categoria')
      window.history.replaceState(null, '', url)
    }
  }, [activeCategoryId, categories])
  const availableCategoryIds = useMemo(() => new Set(products.map((product) => product.categoryId).filter(Boolean)), [products])
  const visibleProducts = useMemo(() => products.filter((product) => (!activeCategoryId || product.categoryId === activeCategoryId) && `${product.name} ${product.description}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))), [products, search, activeCategoryId])
  const selectCategory = (categoryId) => {
    setActiveCategoryId(categoryId)
    const url = new URL(window.location.href)
    if (categoryId) url.searchParams.set('categoria', categoryId)
    else url.searchParams.delete('categoria')
    window.history.pushState(null, '', url)
  }
  const cartCount = cart.reduce((count, item) => count + item.quantity, 0)
  const addProduct = (product) => {
    setCart((current) => {
      const existing = current.find((item) => item.cartId === `product-${product.id}`)
      if (existing) return current.map((item) => item.cartId === existing.cartId ? { ...item, quantity: item.quantity + 1 } : item)
      return [...current, { cartId: `product-${product.id}`, type: 'product', name: product.name, image: product.images[0], price: product.price, quantity: 1, productId: product.id }]
    })
    setCartOpen(true)
  }
  const addCustom = (configuration, price) => {
    setCart((current) => [...current, { cartId: `custom-${Date.now()}`, type: 'custom', name: 'Manilla personalizada', price, quantity: 1, configuration }])
    setCartOpen(true)
  }
  return <>
    <header className="site-header"><div className="header-inner"><Brand /><nav className="main-nav" aria-label="Navegación principal"><a href="#catalogo">Manillas</a><a href="#crear">Diseña la tuya</a><a href="#historia">Nuestra esencia</a></nav><div className="header-actions"><a className="instagram-link" href="https://instagram.com/poder_oculto7" target="_blank" rel="noreferrer">Instagram <span aria-hidden="true">↗</span></a><button className="cart-trigger" aria-label={`Abrir carrito, ${cartCount} artículos`} onClick={() => setCartOpen(true)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg><span className="cart-count">{cartCount}</span></button></div></div></header>
    <main>
      <section className="hero"><div className="hero-copy"><span className="eyebrow">PIEZAS HECHAS A MANO · COLOMBIA</span><h1>Un símbolo.<br /><em>Tu propia energía.</em></h1><p>Macramé, piedras y pequeños detalles para acompañarte todos los días.</p><div className="hero-actions"><a className="button button-primary" href="#catalogo">Encuentra tu manilla <span aria-hidden="true">↓</span></a><a className="text-link" href="#crear">O crea la tuya</a></div><div className="hero-note"><span>✦</span> Tejidas a mano, una a una</div></div><div className="hero-art"><img src="/products/1.1.jpeg" alt="Manilla roja tejida a mano con piedras naturales" /><div className="hero-stamp"><span>HECHO</span><strong>con<br />intención</strong><span>✧ A MANO ✧</span></div></div><div className="hero-decor" aria-hidden="true">✧</div></section>
      <section className="intro-strip" id="historia"><div><span className="eyebrow">PODER OCULTO</span><p>Conecta con tu energía natural. El arte del macramé se encuentra con la belleza de las piedras para crear un amuleto único, hecho para ti.</p></div><a href="https://instagram.com/poder_oculto7" target="_blank" rel="noreferrer">Descubre nuestra historia en Instagram ↗</a></section>
      <section className="colombia-section" aria-labelledby="colombia-title">
        <div className="colombia-copy"><span className="eyebrow">HECHO EN COLOMBIA</span><h2 id="colombia-title">Tejido con los colores de nuestra tierra</h2><p>Cada nudo cuenta una historia. Nuestras manillas llevan el amarillo, el azul y el rojo de Colombia: un homenaje a la tierra que nos inspira, tejido hilo a hilo por manos colombianas.</p><a className="button button-primary" href="/?categoria=colombiana#catalogo">Ver manillas colombianas <span aria-hidden="true">↓</span></a><div className="colombia-note"><span aria-hidden="true">✦</span> Tradición y detalle en cada tejido</div></div>
        <div className="colombia-gallery" aria-label="Manillas tejidas inspiradas en Colombia">
          <img className="colombia-photo colombia-photo-featured" src="/colombia/colombia-heart.jpeg" alt="Manilla negra con cuentas de colores y un corazón con la bandera de Colombia" />
          <img className="colombia-photo" src="/colombia/colombia-red.jpeg" alt="Manilla roja tejida con cuentas amarillas, azules y rojas" />
          <img className="colombia-photo" src="/colombia/colombia-black.jpeg" alt="Manilla negra tejida con cuentas en los colores de Colombia" />
          <img className="colombia-photo" src="/colombia/colombia-upright.jpeg" alt="Manilla negra de macramé con detalles de cuentas tricolores" />
        </div>
      </section>
      <section className="section catalog-section" id="catalogo"><div className="section-heading section-heading-row"><div><span className="eyebrow">ELIGE LA QUE TE LLAMA</span><h2>Manillas con historia</h2><p>Cada pieza está tejida a mano y lista para acompañarte.</p></div><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Buscar manillas" placeholder="Buscar una manilla" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
        <div className="category-filters" role="group" aria-label="Filtrar por categoría"><button className={`category-filter${activeCategoryId ? '' : ' active'}`} aria-pressed={!activeCategoryId} onClick={() => selectCategory('')}>Todas</button>{categories.filter((category) => availableCategoryIds.has(category.id)).map((category) => <button key={category.id} className={`category-filter${activeCategoryId === category.id ? ' active' : ''}`} aria-pressed={activeCategoryId === category.id} onClick={() => selectCategory(category.id)}>{category.nombre}</button>)}</div>
        {loadMessage && <p className="notice" role="status">{loadMessage}</p>}
        <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addProduct} />)}</div>
        {!visibleProducts.length && <p className="empty-search">No encontramos piezas con ese nombre. Prueba otra búsqueda.</p>}
      </section>
      <BraceletDesigner onAdd={addCustom} />
      <section className="closing-banner"><span className="eyebrow">UN DETALLE HECHO PARA TI</span><h2>¿Lista para encontrar tu símbolo?</h2><p>Escríbenos si tienes una idea especial; estaremos felices de ayudarte.</p><a className="button button-light" href={whatsappUrl(WHATSAPP, 'Hola, vengo de la página de Poder Oculto y quiero más información.')} target="_blank" rel="noreferrer">Hablemos por WhatsApp <span aria-hidden="true">↗</span></a></section>
    </main>
    <footer className="site-footer"><Brand compact /><p>Manillas hechas a mano para acompañar tu energía.</p><a href="https://instagram.com/poder_oculto7" target="_blank" rel="noreferrer">@poder_oculto7 ↗</a><small>© {new Date().getFullYear()} Poder Oculto · Hecho con intención</small></footer>
    <a className="whatsapp-float" href={whatsappUrl(WHATSAPP, 'Hola, vengo de la página web de Poder Oculto y quiero más información.')} target="_blank" rel="noreferrer" aria-label="Contactar a Poder Oculto por WhatsApp"><span aria-hidden="true">◉</span><span>¿Hablamos?</span></a>
    {cartOpen && <CartDrawer items={cart} setItems={setCart} onClose={() => setCartOpen(false)} />}
  </>
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) return <Suspense fallback={<main className="admin-page"><p>Cargando panel…</p></main>}><Admin /></Suspense>
  return <Storefront />
}
