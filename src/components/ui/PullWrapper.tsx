'use client'
// Wrapper che sposta fisicamente il contenuto della pagina verso il basso
// durante il pull-to-refresh, come fa Instagram.
// Avvolge il contenuto di una pagina e si trasla via CSS transform.

interface Props {
  distance: number
  refreshing: boolean
  children: React.ReactNode
}

export function PullWrapper({ distance, refreshing, children }: Props) {
  const translateY = refreshing
    ? Math.min(distance, 56)  // rimane fermo mentre carica
    : distance

  return (
    <div
      className="md:transform-none"
      style={{
        transform: `translateY(${translateY}px)`,
        transition: distance === 0 && !refreshing ? 'transform 0.3s ease' : 'none',
        willChange: distance > 0 ? 'transform' : 'auto',
      }}
    >
      {children}
    </div>
  )
}
