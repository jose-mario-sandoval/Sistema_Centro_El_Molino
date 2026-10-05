import { describe, expect, it } from 'vitest'
import { HORAS_LIMITE_POR_DEFECTO } from '@/lib/comidas/tipos'
import {
  cambioPedidoCocina,
  cargaAusencia,
  cargaCambioComida,
  cargaCambioPlan,
  cargaExtraCocina,
  cargaPedidoCocina,
  cargaSeriePedidos,
  esUltimoMomento,
  importaALaCocina,
  paraCocina,
  type PedidoCocina,
} from '@/lib/push/cargas-casa'
import { LARGO_MAXIMO_CUERPO } from '@/lib/push/mensajes-push'

const PERSONA = 'r1'
// Martes 29/9/2026 a las 11:00 en la casa (UTC-6).
const HOY = '2026-09-29'

describe('(c) el Director cambió algo tuyo', () => {
  it('una comida: qué comida, de qué día y cómo quedó; abre esa semana', () => {
    expect(
      cargaCambioComida({
        personaId: PERSONA,
        fecha: '2026-09-30',
        comida: 'almuerzo',
        resultado: { valor: { estado: 'temprano', nota: '12:00' }, origen: 'persona' },
      }),
    ).toEqual({
      titulo: 'El Director cambió tu almuerzo del miércoles 30/9',
      cuerpo: 'Ahora: Comer temprano 12:00.',
      url: '/comidas/semana?semana=2026-09-28',
      etiqueta: 'cambio-comida-r1',
    })
  })

  it('volver al plan dice cómo quedó: según el plan, por la ausencia o sin definir', () => {
    const base = { personaId: PERSONA, fecha: '2026-10-05', comida: 'cena' as const }
    expect(cargaCambioComida({ ...base, resultado: { valor: { estado: 'si', nota: null }, origen: 'plan' } })).toMatchObject({
      titulo: 'El Director cambió tu cena del lunes 5/10',
      cuerpo: 'Volvió a tu plan: Sí comer.',
      url: '/comidas/semana?semana=2026-10-05',
    })
    expect(cargaCambioComida({ ...base, resultado: { valor: { estado: 'no', nota: null }, origen: 'ausencia' } }).cuerpo).toBe(
      'Volvió a tu ausencia: No comer.',
    )
    expect(cargaCambioComida({ ...base, resultado: { valor: null, origen: 'plan' } }).cuerpo).toBe(
      'Volvió a tu plan, que no dice nada para esa comida: quedó sin definir.',
    )
  })

  it('el plan: de qué día de la semana y qué comida; abre el plan', () => {
    expect(cargaCambioPlan({ personaId: PERSONA, diaSemana: 2, comida: 'almuerzo', valor: { estado: 'bolsa', nota: null } })).toEqual({
      titulo: 'El Director cambió tu plan de los martes',
      cuerpo: 'Almuerzo: En bolsa.',
      url: '/comidas/plan',
      etiqueta: 'cambio-plan-r1',
    })
    expect(cargaCambioPlan({ personaId: PERSONA, diaSemana: 6, comida: 'cena', valor: null })).toMatchObject({
      titulo: 'El Director cambió tu plan de los sábados',
      cuerpo: 'Cena: sin definir.',
    })
  })

  it('ausencias marcadas y quitadas, de uno o varios días; abren el calendario de ese mes', () => {
    expect(cargaAusencia({ personaId: PERSONA, desde: '2026-10-05', hasta: '2026-10-09', accion: 'marcada' })).toEqual({
      titulo: 'El Director marcó una ausencia del 5 al 9 de octubre',
      cuerpo: 'Tus comidas de esos días quedan canceladas.',
      url: '/calendario?mes=2026-10',
      etiqueta: 'cambio-ausencia-r1',
    })
    expect(cargaAusencia({ personaId: PERSONA, desde: '2026-10-05', hasta: '2026-10-05', accion: 'marcada' })).toMatchObject({
      titulo: 'El Director marcó una ausencia para el 5 de octubre',
      cuerpo: 'Tus comidas de ese día quedan canceladas.',
    })
    expect(cargaAusencia({ personaId: PERSONA, desde: '2026-09-28', hasta: '2026-10-02', accion: 'quitada' })).toMatchObject({
      titulo: 'El Director quitó tu ausencia del 28 de septiembre al 2 de octubre',
      cuerpo: 'Tus comidas de esos días vuelven a tu plan.',
      url: '/calendario?mes=2026-09',
    })
  })

  it('la etiqueta es por persona y por tipo: una ráfaga de cambios reemplaza el aviso anterior', () => {
    const a = cargaCambioComida({ personaId: PERSONA, fecha: '2026-09-30', comida: 'almuerzo', resultado: { valor: null, origen: 'plan' } })
    const b = cargaCambioComida({ personaId: PERSONA, fecha: '2026-10-01', comida: 'cena', resultado: { valor: null, origen: 'plan' } })
    const otra = cargaCambioComida({ personaId: 'r2', fecha: '2026-09-30', comida: 'almuerzo', resultado: { valor: null, origen: 'plan' } })
    expect(a.etiqueta).toBe(b.etiqueta)
    expect(otra.etiqueta).not.toBe(a.etiqueta)
    expect(cargaCambioPlan({ personaId: PERSONA, diaSemana: 1, comida: 'cena', valor: null }).etiqueta).not.toBe(a.etiqueta)
  })
})

describe('esUltimoMomento', () => {
  const horas = HORAS_LIMITE_POR_DEFECTO // almuerzo: mismo día 10:00; desayuno: el día anterior 21:00
  it('hoy, siempre', () => {
    expect(esUltimoMomento({ fecha: HOY, comida: 'cena', ahora: new Date('2026-09-29T08:00:00-06:00'), horas })).toBe(true)
  })

  it('otro día, solo si ya pasó la hora límite de esa comida', () => {
    expect(esUltimoMomento({ fecha: '2026-09-30', comida: 'desayuno', ahora: new Date('2026-09-29T20:59:00-06:00'), horas })).toBe(false)
    expect(esUltimoMomento({ fecha: '2026-09-30', comida: 'desayuno', ahora: new Date('2026-09-29T21:00:00-06:00'), horas })).toBe(true)
    expect(esUltimoMomento({ fecha: '2026-09-30', comida: 'almuerzo', ahora: new Date('2026-09-29T23:00:00-06:00'), horas })).toBe(false)
  })
})

describe('(d) extras para la cocina', () => {
  it('agregado con nota: comida, cantidad, nota y total; abre esa semana', () => {
    expect(
      cargaExtraCocina({ fecha: '2026-10-01', comida: 'almuerzo', cantidad: 3, nota: 'sin sal', accion: 'agregado', total: 5, ultimoMomento: false, hoy: HOY }),
    ).toEqual({
      titulo: 'Extra para la cocina',
      cuerpo: 'Almuerzo del jueves 1/10: 3 personas más (sin sal). Total de extras: 5 personas.',
      url: '/comidas/semana?semana=2026-09-28',
      etiqueta: 'cocina-extras-2026-10-01-almuerzo',
    })
  })

  it('de último momento lo dice y vuelve a sonar aunque reemplace el aviso anterior; hoy y mañana se nombran así', () => {
    expect(
      cargaExtraCocina({ fecha: HOY, comida: 'cena', cantidad: 1, nota: null, accion: 'agregado', total: 1, ultimoMomento: true, hoy: HOY }),
    ).toMatchObject({
      titulo: 'Extra de último momento',
      cuerpo: 'Cena de hoy: 1 persona más. Total de extras: 1 persona.',
      renotificar: true,
    })
    expect(
      cargaExtraCocina({ fecha: '2026-09-30', comida: 'desayuno', cantidad: 2, nota: null, accion: 'agregado', total: 2, ultimoMomento: true, hoy: HOY }).cuerpo,
    ).toBe('Desayuno de mañana: 2 personas más. Total de extras: 2 personas.')
  })

  it('quitado: cuántos menos y cuántos quedan', () => {
    expect(
      cargaExtraCocina({ fecha: '2026-10-01', comida: 'almuerzo', cantidad: 3, nota: null, accion: 'quitado', total: 0, ultimoMomento: false, hoy: HOY }),
    ).toMatchObject({ titulo: 'Se quitó un extra', cuerpo: 'Almuerzo del jueves 1/10: 3 personas menos. Ya no quedan extras.' })
    expect(
      cargaExtraCocina({ fecha: HOY, comida: 'cena', cantidad: 2, nota: null, accion: 'quitado', total: 1, ultimoMomento: true, hoy: HOY }).titulo,
    ).toBe('Extra quitado a último momento')
  })
})

describe('(d) pedidos de eventos para la cocina', () => {
  const pedido = (cambios: Partial<PedidoCocina> = {}): PedidoCocina => ({
    fecha: '2026-10-01',
    hora: '15:00:00',
    // "Otro" no se nombra en el aviso: las pruebas que no miran la categoría quedan con el texto de siempre.
    tipo: 'otro',
    requiere_cocina: ['merienda'],
    requiere_otro_texto: null,
    ...cambios,
  })

  it('qué cambió para la cocina', () => {
    expect(cambioPedidoCocina(null, pedido(), HOY)).toBe('nuevo')
    expect(cambioPedidoCocina(pedido({ requiere_cocina: [] }), pedido(), HOY)).toBe('nuevo')
    expect(cambioPedidoCocina(pedido(), null, HOY)).toBe('cancelado')
    expect(cambioPedidoCocina(pedido(), pedido({ requiere_cocina: [], requiere_otro_texto: null }), HOY)).toBe('cancelado')
    expect(cambioPedidoCocina(pedido(), pedido({ hora: '16:00' }), HOY)).toBe('cambiado')
    expect(cambioPedidoCocina(pedido(), pedido({ fecha: '2026-10-02' }), HOY)).toBe('cambiado')
    expect(cambioPedidoCocina(pedido(), pedido({ requiere_otro_texto: '20 sillas' }), HOY)).toBe('cambiado')
    expect(cambioPedidoCocina(pedido(), pedido({ requiere_cocina: ['merienda', 'comida'] }), HOY)).toBe('cambiado')
  })

  it('sin cambio para la cocina (solo el título o la categoría, o sin pedido), nada', () => {
    expect(cambioPedidoCocina(pedido(), pedido({ hora: '15:00' }), HOY)).toBeNull()
    expect(cambioPedidoCocina(null, pedido({ requiere_cocina: [] }), HOY)).toBeNull()
    expect(cambioPedidoCocina(pedido({ requiere_cocina: [] }), null, HOY)).toBeNull()
  })

  it('lo que ya pasó no le importa a la cocina', () => {
    expect(cambioPedidoCocina(null, pedido({ fecha: '2026-09-28' }), HOY)).toBeNull()
    expect(cambioPedidoCocina(pedido({ fecha: '2026-09-28' }), null, HOY)).toBeNull()
    expect(cambioPedidoCocina(pedido({ fecha: '2026-09-28' }), pedido(), HOY)).toBe('nuevo')
  })

  it('nuevo y cancelado: cuándo y qué; abren el calendario de ese mes', () => {
    expect(cargaPedidoCocina({ id: 'e1', tipo: 'nuevo', antes: null, despues: pedido({ requiere_otro_texto: '20 sillas' }), hoy: HOY })).toEqual({
      titulo: 'Nuevo pedido para la cocina',
      cuerpo: 'Jueves 1/10, 15:00: Merienda · 20 sillas.',
      url: '/calendario?mes=2026-10',
      etiqueta: 'cocina-evento-e1',
    })
    expect(cargaPedidoCocina({ id: 'e1', tipo: 'cancelado', antes: pedido({ fecha: HOY, hora: null }), despues: null, hoy: HOY })).toMatchObject({
      titulo: 'Se canceló un pedido para la cocina',
      cuerpo: 'Hoy: Merienda.',
      url: '/calendario?mes=2026-09',
    })
  })

  it('cambiado: dice lo nuevo y lo de antes, solo lo que cambió', () => {
    expect(cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: pedido(), despues: pedido({ hora: '16:30' }), hoy: HOY })).toMatchObject({
      titulo: 'Cambió un pedido para la cocina',
      cuerpo: 'Ahora: Jueves 1/10, 16:30: Merienda (antes: jueves 1/10, 15:00).',
    })
    expect(
      cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: pedido(), despues: pedido({ requiere_cocina: ['comida'] }), hoy: HOY }).cuerpo,
    ).toBe('Jueves 1/10, 15:00: ahora Comida (antes: Merienda).')
    expect(
      cargaPedidoCocina({
        id: 'e1',
        tipo: 'cambiado',
        antes: pedido(),
        despues: pedido({ fecha: '2026-09-30', hora: null, requiere_cocina: ['materiales'] }),
        hoy: HOY,
      }).cuerpo,
    ).toBe('Ahora: Mañana: Utensilios y materiales. Antes: Jueves 1/10, 15:00: Merienda.')
  })

  it('una serie en un solo aviso: cuántas fechas, desde cuándo hasta cuándo, a qué hora y qué', () => {
    const fechas = ['2026-10-01', '2026-10-08', '2026-10-15']
    expect(cargaSeriePedidos({ serieId: 's1', accion: 'creada', pedidos: fechas.map((fecha) => pedido({ fecha })) })).toEqual({
      titulo: 'Se agregaron 3 eventos con pedido a cocina',
      cuerpo: 'Del 1 al 15 de octubre, a las 15:00: Merienda.',
      url: '/calendario?mes=2026-10',
      etiqueta: 'cocina-serie-s1',
    })
    expect(cargaSeriePedidos({ serieId: 's1', accion: 'cancelada', pedidos: [pedido({ fecha: '2026-10-08', hora: null })] })).toMatchObject({
      titulo: 'Se canceló 1 evento con pedido a cocina',
      cuerpo: 'El 8 de octubre: Merienda.',
    })
  })

  it('una serie con ocurrencias editadas por separado no inventa una hora ni un pedido comunes', () => {
    const { cuerpo } = cargaSeriePedidos({
      serieId: 's1',
      accion: 'cancelada',
      pedidos: [pedido({ fecha: '2026-10-08' }), pedido({ fecha: '2026-10-01', hora: '09:00', requiere_cocina: ['comida'] })],
    })
    expect(cuerpo).toBe('Del 1 al 8 de octubre: pedidos distintos, miralos en el calendario.')
  })

  it('nombra la categoría junto al cuándo; "Otro" no se nombra (no le dice nada a la cocina)', () => {
    const rafael = pedido({ tipo: 'san_rafael' })
    expect(cargaPedidoCocina({ id: 'e1', tipo: 'nuevo', antes: null, despues: rafael, hoy: HOY }).cuerpo).toBe(
      'Jueves 1/10, 15:00 · San Rafael: Merienda.',
    )
    expect(cargaPedidoCocina({ id: 'e1', tipo: 'cancelado', antes: rafael, despues: null, hoy: HOY }).cuerpo).toBe(
      'Jueves 1/10, 15:00 · San Rafael: Merienda.',
    )
    expect(
      cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: rafael, despues: { ...rafael, hora: '16:30' }, hoy: HOY }).cuerpo,
    ).toBe('Ahora: Jueves 1/10, 16:30 · San Rafael: Merienda (antes: jueves 1/10, 15:00).')
    expect(
      cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: rafael, despues: { ...rafael, requiere_cocina: ['comida'] }, hoy: HOY })
        .cuerpo,
    ).toBe('Jueves 1/10, 15:00 · San Rafael: ahora Comida (antes: Merienda).')
    expect(
      cargaPedidoCocina({
        id: 'e1',
        tipo: 'cambiado',
        antes: rafael,
        despues: { ...rafael, fecha: '2026-09-30', hora: null, requiere_cocina: ['materiales'] },
        hoy: HOY,
      }).cuerpo,
    ).toBe('Ahora: Mañana · San Rafael: Utensilios y materiales. Antes: Jueves 1/10, 15:00: Merienda.')
  })

  it('un cambio solo de categoría no es un cambio para la cocina', () => {
    expect(cambioPedidoCocina(pedido({ tipo: 'san_rafael' }), pedido({ tipo: 'san_miguel' }), HOY)).toBeNull()
  })

  it('una serie nombra la categoría si todas sus fechas la comparten', () => {
    const fechas = ['2026-10-01', '2026-10-08']
    expect(
      cargaSeriePedidos({ serieId: 's1', accion: 'creada', pedidos: fechas.map((fecha) => pedido({ fecha, tipo: 'san_gabriel' })) })
        .cuerpo,
    ).toBe('Del 1 al 8 de octubre, a las 15:00 · San Gabriel: Merienda.')
    expect(
      cargaSeriePedidos({
        serieId: 's1',
        accion: 'creada',
        pedidos: [pedido({ fecha: fechas[0], tipo: 'san_gabriel' }), pedido({ fecha: fechas[1], tipo: 'san_miguel' })],
      }).cuerpo,
    ).toBe('Del 1 al 8 de octubre, a las 15:00: Merienda.')
  })

  it('nunca lleva títulos ni nombres aunque el objeto los traiga; la categoría sí, escrita', () => {
    const conDeMas = { ...pedido({ tipo: 'san_rafael' }), titulo: 'Cumpleaños de Juan Pérez', creado_por: 'Directora Prueba' }
    const cargas = [
      cargaPedidoCocina({ id: 'e1', tipo: 'nuevo', antes: null, despues: conDeMas, hoy: HOY }),
      cargaPedidoCocina({ id: 'e1', tipo: 'cambiado', antes: conDeMas, despues: { ...conDeMas, hora: '18:00' }, hoy: HOY }),
      cargaSeriePedidos({ serieId: 's1', accion: 'creada', pedidos: [conDeMas] }),
    ]
    for (const carga of cargas) {
      const json = JSON.stringify(carga)
      expect(json).not.toMatch(/Cumpleaños|Juan|Pérez|san_rafael|Directora/)
      expect(carga.cuerpo).toContain('San Rafael')
      expect(Array.from(carga.cuerpo).length).toBeLessThanOrEqual(LARGO_MAXIMO_CUERPO)
    }
  })
})

describe('paraCocina / importaALaCocina', () => {
  it('de un evento completo deja solo lo que la cocina puede saber', () => {
    const evento = {
      id: 'e1',
      titulo: 'Cumpleaños de Juan',
      tipo: 'san_rafael' as const,
      fecha: '2026-10-01',
      hora: '15:00:00',
      requiere_cocina: ['merienda' as const],
      requiere_otro_texto: null,
      serie_id: 's1',
      creado_por: 'x',
    }
    expect(paraCocina(evento)).toEqual({
      fecha: '2026-10-01',
      hora: '15:00:00',
      tipo: 'san_rafael',
      requiere_cocina: ['merienda'],
      requiere_otro_texto: null,
    })
  })

  it('importa si pide algo y es de hoy en adelante', () => {
    const base: PedidoCocina = { fecha: HOY, hora: null, tipo: 'otro', requiere_cocina: [], requiere_otro_texto: '  ' }
    expect(importaALaCocina(base, HOY)).toBe(false)
    expect(importaALaCocina({ ...base, requiere_otro_texto: 'Sillas' }, HOY)).toBe(true)
    expect(importaALaCocina({ ...base, requiere_cocina: ['comida'], fecha: '2026-09-28' }, HOY)).toBe(false)
  })
})
