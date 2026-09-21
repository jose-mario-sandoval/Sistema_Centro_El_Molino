'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { guardarApariencia } from '@/components/app/acciones-apariencia'
import {
  APARIENCIA_POR_DEFECTO,
  atributosApariencia,
  CLAVE_APARIENCIA,
  conciliar,
  leerGuardado,
  resolverApariencia,
  type Apariencia,
} from '@/lib/apariencia'

/** Avisa a todos los controles de esta pestaña que la apariencia cambió. */
const EVENTO = 'molino:apariencia'

function sistemaPideContraste(): boolean {
  return !!window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches
}

function leerDelDispositivo(): Partial<Apariencia> {
  try {
    return leerGuardado(localStorage.getItem(CLAVE_APARIENCIA))
  } catch {
    return {}
  }
}

function aparienciaActual(): Apariencia {
  return resolverApariencia(leerDelDispositivo(), sistemaPideContraste())
}

function pintar(apariencia: Apariencia) {
  const html = document.documentElement
  for (const [atributo, valor] of Object.entries(atributosApariencia(apariencia))) {
    if (valor === null) html.removeAttribute(atributo)
    else html.setAttribute(atributo, valor)
  }
}

function suscribir(avisar: () => void) {
  // Cambió en otra pestaña: se repinta también esta.
  const desdeOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_APARIENCIA) return
    pintar(aparienciaActual())
    avisar()
  }
  window.addEventListener(EVENTO, avisar)
  window.addEventListener('storage', desdeOtraPestana)
  return () => {
    window.removeEventListener(EVENTO, avisar)
    window.removeEventListener('storage', desdeOtraPestana)
  }
}

// Texto y no objeto: useSyncExternalStore compara por identidad.
const instantanea = () => JSON.stringify(aparienciaActual())
const instantaneaServidor = () => JSON.stringify(APARIENCIA_POR_DEFECTO)

/**
 * `guardarEnCuenta`: además del dispositivo, guarda el cambio en la cuenta para que siga a la
 * persona. Solo con sesión: en el login no hay cuenta a la que guardar.
 */
export function useApariencia(guardarEnCuenta = false) {
  const texto = useSyncExternalStore(suscribir, instantanea, instantaneaServidor)
  const apariencia = useMemo(() => JSON.parse(texto) as Apariencia, [texto])

  const cambiar = useCallback((cambio: Partial<Apariencia>) => {
    // Solo se guarda lo que la persona eligió: lo no elegido sigue al sistema.
    const guardado = { ...leerDelDispositivo(), ...cambio }
    try {
      localStorage.setItem(CLAVE_APARIENCIA, JSON.stringify(guardado))
    } catch {
      // Almacenamiento bloqueado: se aplica igual en esta visita.
    }
    pintar(resolverApariencia(guardado, sistemaPideContraste()))
    window.dispatchEvent(new Event(EVENTO))
    // Sin esperar la respuesta ni avisar si falla: el cambio ya se ve, y el dispositivo lo recuerda.
    if (guardarEnCuenta) void guardarApariencia(cambio).catch(() => {})
  }, [guardarEnCuenta])

  return [apariencia, cambiar] as const
}

type Grupo<K extends keyof Apariencia> = {
  clave: K
  titulo: string
  ayuda: string
  opciones: readonly (readonly [Apariencia[K], string])[]
}

const GRUPOS = [
  {
    clave: 'texto',
    titulo: 'Tamaño de la letra',
    ayuda: 'Cambia el tamaño de toda la aplicación, no solo de esta pantalla.',
    opciones: [
      ['normal', 'Normal'],
      ['grande', 'Grande'],
      ['enorme', 'Muy grande'],
    ],
  } satisfies Grupo<'texto'>,
  {
    clave: 'contraste',
    titulo: 'Contraste',
    ayuda: 'Alto quita el relieve y marca todo con bordes firmes.',
    opciones: [
      ['suave', 'Suave'],
      ['alto', 'Alto'],
    ],
  } satisfies Grupo<'contraste'>,
  {
    clave: 'tema',
    titulo: 'Tema',
    ayuda: 'Automático sigue la configuración del teléfono.',
    opciones: [
      ['auto', 'Automático'],
      ['claro', 'Claro'],
      ['oscuro', 'Oscuro'],
    ],
  } satisfies Grupo<'tema'>,
]

/** Los tres ajustes, aplicados al instante. Se usa en Ajustes y en el panel de "Aa". */
export function OpcionesApariencia({ guardarEnCuenta = false }: { guardarEnCuenta?: boolean }) {
  const [apariencia, cambiar] = useApariencia(guardarEnCuenta)
  const id = useId()

  return (
    <div className="opciones-apariencia">
      {GRUPOS.map((grupo) => (
        <div key={grupo.clave} className="ajuste-apariencia">
          <div className="ajuste-titulo" id={`${id}-${grupo.clave}`}>
            {grupo.titulo}
          </div>
          <div className="hint" id={`${id}-${grupo.clave}-ayuda`}>
            {grupo.ayuda}
          </div>
          <div
            className="grupo-opciones"
            role="group"
            aria-labelledby={`${id}-${grupo.clave}`}
            aria-describedby={`${id}-${grupo.clave}-ayuda`}
          >
            {grupo.opciones.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className="opcion-apariencia"
                aria-pressed={apariencia[grupo.clave] === valor}
                onClick={() => cambiar({ [grupo.clave]: valor })}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * "Aa": acceso directo a la apariencia. Está también en el login, porque quien no puede leer la
 * pantalla tampoco puede entrar a arreglarla. Nunca flota sobre contenido: vive en la barra
 * superior, en el lateral o arriba del login.
 */
export function BotonApariencia({
  conTexto = false,
  hacia = 'abajo',
  guardarEnCuenta = false,
}: {
  conTexto?: boolean
  hacia?: 'abajo' | 'arriba'
  guardarEnCuenta?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false)
    if (devolverFoco) boton.current?.focus()
  }, [])

  useEffect(() => {
    if (!abierto) return
    panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar(true)
    }
    const alTocar = (e: PointerEvent) => {
      const destino = e.target as Node
      if (!panel.current?.contains(destino) && !boton.current?.contains(destino)) cerrar(false)
    }
    document.addEventListener('keydown', alTeclear)
    document.addEventListener('pointerdown', alTocar)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.removeEventListener('pointerdown', alTocar)
    }
  }, [abierto, cerrar])

  return (
    <div className={`apariencia-rapida hacia-${hacia}`}>
      <button
        ref={boton}
        type="button"
        className={conTexto ? 'btn ghost block boton-apariencia' : 'boton-aa'}
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={conTexto ? undefined : 'Apariencia: tamaño de letra, contraste y tema'}
        onClick={() => (abierto ? cerrar(false) : setAbierto(true))}
      >
        <span className="aa" aria-hidden="true">
          Aa
        </span>
        {conTexto && <span>Apariencia</span>}
      </button>
      {abierto && (
        <div ref={panel} id={id} className="panel-apariencia" role="group" aria-label="Apariencia">
          <OpcionesApariencia guardarEnCuenta={guardarEnCuenta} />
          <button type="button" className="btn block" onClick={() => cerrar(true)}>
            Listo
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Al abrir la app con sesión, la apariencia de la cuenta manda sobre la del dispositivo (así sigue
 * a la persona entre teléfonos), y lo que solo estaba en el dispositivo sube a la cuenta una vez.
 * Corre antes de pintar cuando la app se abre navegando desde el login.
 */
export function SincronizarApariencia({ cuenta }: { cuenta: Partial<Apariencia> }) {
  // Por valor, no por identidad: el servidor manda un objeto nuevo en cada render.
  const clave = JSON.stringify(cuenta)

  useLayoutEffect(() => {
    const deLaCuenta = JSON.parse(clave) as Partial<Apariencia>
    const { aplicar, subir } = conciliar(leerDelDispositivo(), deLaCuenta)

    if (Object.keys(aplicar).length > 0) {
      const guardado = { ...leerDelDispositivo(), ...aplicar }
      try {
        localStorage.setItem(CLAVE_APARIENCIA, JSON.stringify(guardado))
      } catch {
        // Almacenamiento bloqueado: se aplica igual en esta visita.
      }
      pintar(resolverApariencia(guardado, sistemaPideContraste()))
      window.dispatchEvent(new Event(EVENTO))
    }
    if (Object.keys(subir).length > 0) void guardarApariencia(subir).catch(() => {})
  }, [clave])

  return null
}
