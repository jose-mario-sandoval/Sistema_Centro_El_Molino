import { describe, expect, it } from 'vitest'
import {
  destinatariosPublicacion,
  destinatariosRecordatorio,
  destinatariosRespuesta,
  separarPorVisibilidad,
  type PerfilAviso,
} from '@/lib/push/destinatarios'

const perfiles: PerfilAviso[] = [
  { id: 'a', activo: true, avisar_mensajes: true, avisar_hora_limite: true },
  { id: 'b', activo: true, avisar_mensajes: false, avisar_hora_limite: true },
  { id: 'c', activo: false, avisar_mensajes: true, avisar_hora_limite: true },
  { id: 'd', activo: true, avisar_mensajes: true, avisar_hora_limite: false },
  { id: 'e', activo: true, avisar_mensajes: true, avisar_hora_limite: true },
]

describe('destinatariosPublicacion', () => {
  it('avisa a todos los activos con avisar_mensajes, menos al autor', () => {
    expect(destinatariosPublicacion({ autorId: 'a', perfiles })).toEqual(['d', 'e'])
  })

  it('no avisa a nadie si no hay otros perfiles', () => {
    expect(destinatariosPublicacion({ autorId: 'a', perfiles: [perfiles[0]] })).toEqual([])
  })
})

describe('destinatariosRespuesta', () => {
  it('avisa al autor de la publicación y a quienes respondieron, sin repetir ni incluir a quien responde', () => {
    expect(
      destinatariosRespuesta({
        autorPublicacionId: 'd',
        autoresRespuestas: ['e', 'b', 'a', 'e'],
        quienRespondeId: 'a',
        perfiles,
      }),
    ).toEqual(['d', 'e'])
  })

  it('no avisa al autor de la publicación cuando se responde a sí mismo', () => {
    expect(
      destinatariosRespuesta({ autorPublicacionId: 'd', autoresRespuestas: [], quienRespondeId: 'd', perfiles }),
    ).toEqual([])
  })

  it('omite al autor de la publicación si está inactivo', () => {
    expect(
      destinatariosRespuesta({ autorPublicacionId: 'c', autoresRespuestas: ['e'], quienRespondeId: 'a', perfiles }),
    ).toEqual(['e'])
  })

  it('no avisa a quien no participa en el hilo', () => {
    expect(
      destinatariosRespuesta({ autorPublicacionId: 'e', autoresRespuestas: [], quienRespondeId: 'a', perfiles }),
    ).toEqual(['e'])
  })
})

describe('destinatariosRecordatorio', () => {
  it('avisa a quienes tienen la comida sin definir, están activos y quieren el recordatorio', () => {
    expect(destinatariosRecordatorio({ sinDefinir: ['a', 'b', 'c', 'd', 'desconocido'], perfiles })).toEqual(['a', 'b'])
  })

  it('no avisa a nadie si no hay comidas sin definir', () => {
    expect(destinatariosRecordatorio({ sinDefinir: [], perfiles })).toEqual([])
  })
})

describe('separarPorVisibilidad', () => {
  const roles = [
    { id: 'a', rol: 'director' as const },
    { id: 'b', rol: 'residente' as const },
    { id: 'c', rol: 'administracion' as const },
  ]

  it('separa a Administración, que solo ve siglas, de quienes conocen el nombre', () => {
    expect(separarPorVisibilidad(['a', 'b', 'c'], roles)).toEqual({ conNombre: ['a', 'b'], soloSiglas: ['c'] })
  })

  it('conserva el orden de entrada dentro de cada grupo', () => {
    expect(separarPorVisibilidad(['c', 'b', 'a'], roles)).toEqual({ conNombre: ['b', 'a'], soloSiglas: ['c'] })
  })

  it('un destinatario sin rol conocido va con las siglas: ante la duda, lo más privado', () => {
    expect(separarPorVisibilidad(['a', 'x'], roles)).toEqual({ conNombre: ['a'], soloSiglas: ['x'] })
  })

  it('sin destinatarios devuelve dos listas vacías', () => {
    expect(separarPorVisibilidad([], roles)).toEqual({ conNombre: [], soloSiglas: [] })
  })
})
