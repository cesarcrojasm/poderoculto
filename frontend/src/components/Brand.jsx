export default function Brand({ compact = false }) {
  return <a className={`brand${compact ? ' brand-compact' : ''}`} href="/" aria-label="Poder Oculto, inicio">
    <img src="/brand/mark.svg" alt="" width="52" height="52" />
    <span><strong>Poder Oculto</strong>{!compact && <small>manillas con intención</small>}</span>
  </a>
}
