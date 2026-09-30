import { describe, expect, it } from 'vitest'
import { descripcionAvisos, opcionesAvisos } from '@/lib/push/preferencias'

const claves = (rol: Parameters<typeof opcionesAvisos>[0]) => opcionesAvisos(rol).map((o) => o.clave)

describe('opcionesAvisos: qué avisos puede apagar cada rol en Ajustes', () => {
  it('Residente: mensajes, hora límite y cambios del Director', () => {
    expect(claves('residente')).toEqual(['avisarMensajes', 'avisarHoraLimite', 'avisarCambios'])
    expect(opcionesAvisos('residente').find((o) => o.clave === 'avisarCambios')?.etiqueta).toBe(
      'Cambios que hace el Director en mis comidas',
    )
  })

  it('Director: lo mismo, y los cambios son los de otro Director', () => {
    expect(claves('director')).toEqual(['avisarMensajes', 'avisarHoraLimite', 'avisarCambios'])
    expect(opcionesAvisos('director').find((o) => o.clave === 'avisarCambios')?.etiqueta).toBe(
      'Cambios que hace otro Director en mis comidas',
    )
    expect(opcionesAvisos('director')[0].ayuda).toContain('esperan tu aprobación')
  })

  it('Administración: mensajes y cambios para la cocina; sin comidas propias ni recordatorios', () => {
    expect(claves('administracion')).toEqual(['avisarMensajes', 'avisarCocina'])
    expect(opcionesAvisos('administracion')[1].etiqueta).toBe('Cambios para la cocina')
  })

  it('cada opción tiene su id de campo y su ayuda escrita', () => {
    for (const rol of ['director', 'residente', 'administracion'] as const) {
      for (const opcion of opcionesAvisos(rol)) {
        expect(opcion.id).toMatch(/^avisar-/)
        expect(opcion.ayuda.length).toBeGreaterThan(10)
      }
    }
  })
})

describe('descripcionAvisos', () => {
  it('no le menciona a Administración lo que no recibe', () => {
    expect(descripcionAvisos('administracion')).not.toMatch(/hora límite|Director/)
    expect(descripcionAvisos('administracion')).toContain('cocina')
    expect(descripcionAvisos('residente')).toContain('hora límite')
  })
})
