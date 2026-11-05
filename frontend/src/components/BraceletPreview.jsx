export default function BraceletPreview({ stones, thread, charm, metal }) {
  const cx = 180
  const cy = 146
  const rx = 132
  const ry = 90
  return <div className="bracelet-preview" aria-label="Vista previa de tu manilla">
    <svg viewBox="0 0 360 270" role="img" aria-label={`Manilla con ${stones.length} piedras`}>
      <defs><linearGradient id="cord" x1="0" x2="1"><stop stopColor={thread} /><stop offset=".5" stopColor="#806744" stopOpacity=".45" /><stop offset="1" stopColor={thread} /></linearGradient>
        <radialGradient id="gem"><stop offset="0" stopColor="#fff" stopOpacity=".8" /><stop offset=".48" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#33251e" stopOpacity=".22" /></radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="url(#cord)" strokeWidth="8" />
      {stones.map((stone, index) => {
        const angle = (205 + (index / Math.max(stones.length - 1, 1)) * 130) * Math.PI / 180
        const x = cx + rx * Math.cos(angle)
        const y = cy + ry * Math.sin(angle)
        return <g key={stone.instanceId}>
          <circle cx={x} cy={y} r="13" fill={stone.color} stroke="#9c8158" strokeWidth="1.5" />
          <circle cx={x} cy={y} r="13" fill="url(#gem)" />
        </g>
      })}
      {charm && <g className="preview-charm"><circle cx="180" cy="235" r="18" fill="#f5f0e5" stroke="#b28d4f" strokeWidth="2" /><text x="180" y="242" textAnchor="middle" fontSize="23" fill="#9a2828">{charm === 'corazon' ? '♡' : '✚'}</text></g>}
      {metal && <circle cx="180" cy="235" r="6" fill={metal} stroke="#8b734a" strokeWidth="1" />}
    </svg>
    {!stones.length && <p className="preview-note">Tus piedras aparecerán aquí</p>}
  </div>
}
