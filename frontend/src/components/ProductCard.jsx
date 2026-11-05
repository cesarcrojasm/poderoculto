import { useState } from 'react'
import { formatPrice } from '../lib/commerce'

export default function ProductCard({ product, onAdd }) {
  const [photo, setPhoto] = useState(0)
  const photos = product.images?.length ? product.images : ['/brand/mark.svg']
  return <article className="product-card">
    <div className="product-photo">
      <img src={photos[photo]} alt={product.name} loading="lazy" />
      {photos.length > 1 && <div className="photo-controls"><button aria-label="Foto anterior" onClick={() => setPhoto((photo + photos.length - 1) % photos.length)}>‹</button><span>{photo + 1} / {photos.length}</span><button aria-label="Foto siguiente" onClick={() => setPhoto((photo + 1) % photos.length)}>›</button></div>}
    </div>
    <div className="product-copy"><div><h3>{product.name}</h3><p>{product.description}</p></div><div className="product-buy"><strong>{formatPrice(product.price)}</strong><button className="button button-dark" onClick={() => onAdd(product)}>Agregar <span aria-hidden="true">＋</span></button></div></div>
  </article>
}
