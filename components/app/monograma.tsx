/** Monograma provisional de los íconos. `conMargen` deja la zona segura de los íconos maskable. */
export function Monograma({ lado, conMargen }: { lado: number; conMargen: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#3F5D46',
        color: '#F1EDE3',
        fontSize: Math.round(lado * (conMargen ? 0.3 : 0.42)),
        fontWeight: 600,
        letterSpacing: Math.round(lado * 0.01),
      }}
    >
      EM
    </div>
  )
}
