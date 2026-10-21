import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarEventosDeCuadricula } from '@/lib/calendario/consultas'
import { descripcionComidas } from '@/lib/comidas/casa'
import { usuarioObjetivo } from '@/lib/comidas/permisos'
import { publicaDirecto } from '@/lib/mensajes/feed'
import { puedeFijar, textoFijado } from '@/lib/mensajes/fijados'
import { esAdministracion, ETIQUETA_ROL, ROLES, ROLES_CON_COMIDAS } from '@/lib/perfiles/roles'
import { paraObservador } from '@/lib/perfiles/visibilidad'
import {
  destinatarioCambio,
  destinatariosCocina,
  destinatariosPendiente,
  filtrarSoloDirector,
  separarPorVisibilidad,
  type PerfilAviso,
} from '@/lib/push/destinatarios'
import { descripcionAvisos, opcionesAvisos, textoOfrecerAvisos } from '@/lib/push/preferencias'
import { crearClienteServidor } from '@/lib/supabase/servidor'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('Administradora hereda capacidades de Administración y mantiene su rol distinto', () => {
  it('ofrece ambos roles sin convertirlos en comensales', () => {
    expect(ROLES).toContain('administracion')
    expect(ROLES).toContain('administradora')
    expect(ETIQUETA_ROL.administradora).toBe('Administradora')
    expect(ETIQUETA_ROL.administracion).toBe('Administración')
    expect(ROLES_CON_COMIDAS).toEqual(['director', 'residente'])
    expect(esAdministracion('administradora')).toBe(true)
    expect(esAdministracion('director')).toBe(false)
  })

  it('rechaza modificar comidas propias y ajenas y ofrece la vista de cocina', () => {
    const perfil = { id: 'administradora', rol: 'administradora' as const }
    expect(usuarioObjetivo(perfil).ok).toBe(false)
    expect(usuarioObjetivo(perfil, 'residente').ok).toBe(false)
    expect(descripcionComidas(perfil.rol, '/comidas/semana')).toBe(descripcionComidas('administracion', '/comidas/semana'))
  })

  it('publica y fija sin convertirse en Director y mantiene el nombre oculto', () => {
    expect(publicaDirecto('administradora')).toBe(true)
    expect(puedeFijar('administradora')).toBe(true)
    expect(textoFijado(null, 'administradora')).toBe('Fijado por la Administradora hasta que lo quiten')
    const persona = { nombre: 'Nombre completo confidencial', siglas: 'NC', rol: 'residente' as const }
    expect(paraObservador(persona, 'administradora').nombre).toBe('NC')
    expect(paraObservador(persona, 'director').nombre).toBe(persona.nombre)
  })

  it('conserva los avisos de cocina y añade una preferencia independiente de pensiones', () => {
    expect(opcionesAvisos('administradora').filter((o) => o.clave !== 'avisarPensiones')).toEqual(opcionesAvisos('administracion'))
    expect(descripcionAvisos('administradora')).toContain('cambios para la cocina y pagos de pensiones')
    expect(textoOfrecerAvisos('administradora')).toContain('cambios para la cocina y pagos de pensiones')
    expect(opcionesAvisos('administracion').some((o) => o.clave === 'avisarPensiones')).toBe(false)
  })

  it('solo consulta los eventos destinados a cocina', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn()
    vi.mocked(crearClienteServidor).mockResolvedValue({ rpc, from } as never)
    expect(await listarEventosDeCuadricula('2026-10', 'administradora')).toEqual([])
    expect(rpc).toHaveBeenCalledWith('eventos_para_cocina', expect.objectContaining({ p_desde: expect.any(String), p_hasta: expect.any(String) }))
    expect(from).not.toHaveBeenCalled()
  })

  it('recibe avisos privados y de cocina por siglas, sin avisos de moderación o comidas propias', () => {
    const preferencias = { activo: true, avisar_mensajes: true, avisar_hora_limite: true, avisar_cambios: true, avisar_cocina: true }
    const perfiles: PerfilAviso[] = [
      { id: 'directora', rol: 'director', ...preferencias },
      { id: 'administradora', rol: 'administradora', ...preferencias },
      { id: 'cocina', rol: 'administracion', ...preferencias },
      { id: 'residente', rol: 'residente', ...preferencias },
    ]
    expect(filtrarSoloDirector(perfiles.map((p) => p.id), perfiles)).toEqual(['directora', 'administradora', 'cocina'])
    expect(destinatariosCocina({ actorId: 'directora', perfiles })).toEqual(['administradora', 'cocina'])
    expect(destinatariosCocina({ actorId: 'administradora', perfiles })).toEqual(['cocina'])
    expect(destinatariosPendiente({ autorId: 'residente', perfiles })).toEqual(['directora'])
    expect(destinatarioCambio({ personaId: 'administradora', actorId: 'directora', perfiles })).toEqual([])
    expect(separarPorVisibilidad(perfiles.map((p) => p.id), perfiles)).toEqual({
      conNombre: ['directora', 'residente'], soloSiglas: ['administradora', 'cocina'],
    })
  })
})
