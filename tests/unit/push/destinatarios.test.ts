import { describe, expect, it } from 'vitest'
import {
  destinatarioCambio,
  destinatarioModeracion,
  destinatariosCocina,
  destinatariosPendiente,
  destinatariosPublicacion,
  destinatariosRecordatorio,
  destinatariosRespuesta,
  separarPorVisibilidad,
  type PerfilAviso,
} from '@/lib/push/destinatarios'
import type { Rol } from '@/lib/perfiles/roles'

/** Un perfil con todos los avisos activados; `cambios` pisa lo que la prueba necesita. */
function p(id: string, rol: Rol, cambios: Partial<PerfilAviso> = {}): PerfilAviso {
  return {
    id,
    rol,
    activo: true,
    avisar_mensajes: true,
    avisar_hora_limite: true,
    avisar_cambios: true,
    avisar_cocina: true,
    ...cambios,
  }
}

const perfiles: PerfilAviso[] = [
  p('a', 'residente'),
  p('b', 'residente', { avisar_mensajes: false }),
  p('c', 'residente', { activo: false }),
  p('d', 'residente', { avisar_hora_limite: false }),
  p('e', 'residente'),
]

/** Una casa con cada rol, con una preferencia apagada y una cuenta inactiva por rol. */
const casa: PerfilAviso[] = [
  p('dir', 'director'),
  p('dir-sin-mensajes', 'director', { avisar_mensajes: false }),
  p('dir-inactivo', 'director', { activo: false }),
  p('r1', 'residente'),
  p('r-sin-cambios', 'residente', { avisar_cambios: false }),
  p('r-sin-mensajes', 'residente', { avisar_mensajes: false }),
  p('r-inactivo', 'residente', { activo: false }),
  p('adm', 'administracion'),
  p('adm-sin-cocina', 'administracion', { avisar_cocina: false }),
  p('adm-inactiva', 'administracion', { activo: false }),
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

describe('destinatariosPendiente: mensaje por aprobar', () => {
  it('solo a los Directores activos que quieren avisos de mensajes', () => {
    expect(destinatariosPendiente({ autorId: 'r1', perfiles: casa })).toEqual(['dir'])
  })

  it('nunca al autor', () => {
    expect(destinatariosPendiente({ autorId: 'dir', perfiles: casa })).toEqual([])
  })
})

describe('destinatarioModeracion: tu mensaje fue aprobado o no', () => {
  it('al autor, si está activo y quiere avisos de mensajes', () => {
    expect(destinatarioModeracion({ autorId: 'r1', moderadorId: 'dir', perfiles: casa })).toEqual(['r1'])
    expect(destinatarioModeracion({ autorId: 'r-sin-mensajes', moderadorId: 'dir', perfiles: casa })).toEqual([])
    expect(destinatarioModeracion({ autorId: 'r-inactivo', moderadorId: 'dir', perfiles: casa })).toEqual([])
  })

  it('nunca a quien moderó', () => {
    expect(destinatarioModeracion({ autorId: 'dir', moderadorId: 'dir', perfiles: casa })).toEqual([])
  })
})

describe('destinatarioCambio: el Director cambió algo tuyo', () => {
  it('a la persona, si está activa, tiene comidas y quiere el aviso', () => {
    expect(destinatarioCambio({ personaId: 'r1', actorId: 'dir', perfiles: casa })).toEqual(['r1'])
    expect(destinatarioCambio({ personaId: 'r-sin-cambios', actorId: 'dir', perfiles: casa })).toEqual([])
    expect(destinatarioCambio({ personaId: 'r-inactivo', actorId: 'dir', perfiles: casa })).toEqual([])
  })

  it('un Director a otro Director, sí; a sí mismo, nunca', () => {
    expect(destinatarioCambio({ personaId: 'dir-sin-mensajes', actorId: 'dir', perfiles: casa })).toEqual(['dir-sin-mensajes'])
    expect(destinatarioCambio({ personaId: 'dir', actorId: 'dir', perfiles: casa })).toEqual([])
  })

  it('Administración no tiene comidas: nunca', () => {
    expect(destinatarioCambio({ personaId: 'adm', actorId: 'dir', perfiles: casa })).toEqual([])
  })
})

describe('destinatariosCocina: cambios para la cocina', () => {
  it('a Administración activa que quiere el aviso; nunca a quien hizo el cambio', () => {
    expect(destinatariosCocina({ actorId: 'dir', perfiles: casa })).toEqual(['adm'])
    expect(destinatariosCocina({ actorId: 'adm', perfiles: casa })).toEqual([])
  })
})
