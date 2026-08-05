interface AdmissionStampProps {
  className?: string
  size?: number
  animate?: boolean
}

/** Оттиск штампа «ВПУЩЕН» — фирменный элемент лендинга. Один раз крупно в билете, потом мельче у CTA. */
export function AdmissionStamp({ className = '', size = 128, animate = false }: AdmissionStampProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`text-ledger-stamp ${animate ? 'gk-stamp-press' : ''} ${className}`}
      aria-hidden="true"
    >
      <defs>
        <filter id="gkStampRough" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" />
        </filter>
      </defs>
      <g filter="url(#gkStampRough)" stroke="currentColor" fill="none" strokeLinecap="round">
        <circle cx="100" cy="100" r="90" strokeWidth="6" />
        <circle cx="100" cy="100" r="74" strokeWidth="2" />
        <line x1="38" y1="76" x2="162" y2="76" strokeWidth="2" />
        <line x1="38" y1="126" x2="162" y2="126" strokeWidth="2" />
      </g>
      <text
        x="100"
        y="93"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        letterSpacing="3"
        fill="currentColor"
        fontFamily="var(--font-ledger-mono)"
      >
        GATEKEEPER
      </text>
      <text
        x="100"
        y="118"
        textAnchor="middle"
        fontSize="28"
        fontWeight="700"
        letterSpacing="1"
        fill="currentColor"
        fontFamily="var(--font-ledger-mono)"
      >
        ВПУЩЕН
      </text>
    </svg>
  )
}
