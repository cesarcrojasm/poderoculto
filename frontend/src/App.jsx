import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { PRODUCTS } from './data/catalog'
import { cartTotal, formatPrice, makeOrderMessage, readCart, whatsappUrl } from './lib/commerce'
import { hasSupabase, loadProducts, saveOrder } from './lib/supabase'
import Brand from './components/Brand'
import ProductCard from './components/ProductCard'
import BraceletDesigner from './components/BraceletDesigner'
const Admin = lazy(() => import('./components/Admin'))

const WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || '573214411674'

function CartDrawer({ items, setItems, onClose }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('')
  const total = cartTotal(items)
  const updateQuantity = (cartId, quantity) => setItems((current) => current.map((item) => item.cartId === cartId ? { ...item, quantity: Math.max(1, quantity) } : item))
  const removeItem = (cartId) => setItems((current) => current.filter((item) => item.cartId !== cartId))
  const submitOrder = async (event) => {
    event.preventDefault()
    const order = { name: name.trim(), phone: phone.trim(), items, total }
    const message = makeOrderMessage(order.name, order.phone, items, total)
    window.open(whatsappUrl(WHATSAPP, message), '_blank', 'noopener,noreferrer')
    try {
      const result = await saveOrder(order)
      setStatus(result.saved ? '¡Listo! Tu pedido quedó registrado y WhatsApp ya está abierto.' : 'WhatsApp ya está abierto. Conecta Supabase para guardar pedidos en línea.')
    } catch {
      setStatus('WhatsApp ya está abierto, pero no pudimos guardar el pedido. Por favor envíalo desde WhatsApp.')
    }
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
      <form className="checkout-form" onSubmit={submitOrder}><p>Déjanos tus datos y confirma tu pedido por WhatsApp. No se realiza ningún pago en la web.</p>
        <label>Nombre<input autoComplete="name" required maxLength="80" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tu nombre" /></label>
        <label>Celular<input autoComplete="tel" inputMode="tel" required maxLength="20" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="300 000 0000" /></label>
        <button className="button button-primary full-width" type="submit">Continuar por WhatsApp <span aria-hidden="true">↗</span></button>
        {status && <p className="form-status" role="status">{status}</p>}
      </form>
    </>}
  </aside></div>
}

function Storefront() {
  const [products, setProducts] = useState(PRODUCTS)
  const [cart, setCart] = useState(readCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loadMessage, setLoadMessage] = useState('')
  useEffect(() => { localStorage.setItem('poder-oculto-cart', JSON.stringify(cart)) }, [cart])
  useEffect(() => {
    let mounted = true
    loadProducts().then((result) => { if (mounted && result) setProducts(result) }).catch(() => { if (mounted) setLoadMessage('Mostrando el catálogo de muestra. Revisa la conexión de Supabase.') })
    return () => { mounted = false }
  }, [])
  const visibleProducts = useMemo(() => products.filter((product) => `${product.name} ${product.description}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))), [products, search])
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
    <header className="site-header"><div className="header-inner"><Brand /><nav className="main-nav" aria-label="Navegación principal"><a href="#catalogo">Manillas</a><a href="#crear">Diseña la tuya</a><a href="#historia">Nuestra esencia</a></nav><div className="header-actions"><a className="instagram-link" href="https://instagram.com/poder_oculto7" target="_blank" rel="noreferrer">Instagram <span aria-hidden="true">↗</span></a><button className="cart-trigger" aria-label={`Abrir carrito, ${cartCount} artículos`} onClick={() => setCartOpen(true)}><span aria-hidden="true">♧</span><span className="cart-count">{cartCount}</span></button></div></div></header>
    <main>
      <section className="hero"><div className="hero-copy"><span className="eyebrow">PIEZAS HECHAS A MANO · COLOMBIA</span><h1>Un símbolo.<br /><em>Tu propia energía.</em></h1><p>Macramé, piedras y pequeños detalles para acompañarte todos los días.</p><div className="hero-actions"><a className="button button-primary" href="#catalogo">Encuentra tu manilla <span aria-hidden="true">↓</span></a><a className="text-link" href="#crear">O crea la tuya</a></div><div className="hero-note"><span>✦</span> Tejidas a mano, una a una</div></div><div className="hero-art"><img src="/products/1.1.jpeg" alt="Manilla roja tejida a mano con piedras naturales" /><div className="hero-stamp"><span>HECHO</span><strong>con<br />intención</strong><span>✧ A MANO ✧</span></div></div><div className="hero-decor" aria-hidden="true">✧</div></section>
      <section className="intro-strip" id="historia"><div><span className="eyebrow">PODER OCULTO</span><p>Conecta con tu energía natural. El arte del macramé se encuentra con la belleza de las piedras para crear un amuleto único, hecho para ti.</p></div><a href="https://instagram.com/poder_oculto7" target="_blank" rel="noreferrer">Descubre nuestra historia en Instagram ↗</a></section>
      <section className="section catalog-section" id="catalogo"><div className="section-heading section-heading-row"><div><span className="eyebrow">ELIGE LA QUE TE LLAMA</span><h2>Manillas con historia</h2><p>Cada pieza está tejida a mano y lista para acompañarte.</p></div><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Buscar manillas" placeholder="Buscar una manilla" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
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
