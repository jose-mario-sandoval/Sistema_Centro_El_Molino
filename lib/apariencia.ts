/**
 * Preferencias de apariencia de cada persona (DESIGN.md §5): tema, contraste y tamaño de letra.
 * Viven en este dispositivo (localStorage) y se aplican como atributos de <html>, que es lo que
 * lee globals.css. Los valores por defecto no ponen ningún atributo.
 */

export const CLAVE_APARIENCIA = 'molino-apariencia'

export const TEMAS = ['auto', 'claro', 'oscuro'] as const
export const CONTRASTES = ['suave', 'alto'] as const
export const TAMANOS = ['normal', 'grande', 'enorme'] as const

export type Tema = (typeof TEMAS)[number]
export type Contraste = (typeof CONTRASTES)[number]
export type Tamano = (typeof TAMANOS)[number]
export type Apariencia = { tema: Tema; contraste: Contraste; texto: Tamano }

export const APARIENCIA_POR_DEFECTO: Apariencia = { tema: 'auto', contraste: 'suave', texto: 'normal' }

function elegir<T extends string>(valores: readonly T[], valor: unknown): T | undefined {
  return valores.find((v) => v === valor)
}

/**
 * Lo guardado en el dispositivo; lo que falte o no se reconozca queda sin elegir.
 * `contraste` sin elegir importa: entonces decide `prefers-contrast` del sistema.
 */
export function leerGuardado(texto: string | null): Partial<Apariencia> {
  let datos: unknown
  try {
    datos = texto ? JSON.parse(texto) : null
  } catch {
    return {}
  }
  if (!datos || typeof datos !== 'object') return {}
  const d = datos as Record<string, unknown>
  const resultado: Partial<Apariencia> = {}
  const tema = elegir(TEMAS, d.tema)
  const contraste = elegir(CONTRASTES, d.contraste)
  const tamano = elegir(TAMANOS, d.texto)
  if (tema) resultado.tema = tema
  if (contraste) resultado.contraste = contraste
  if (tamano) resultado.texto = tamano
  return resultado
}

/** Apariencia efectiva: lo guardado, y si no, el sistema (contraste) o el valor por defecto. */
export function resolverApariencia(guardado: Partial<Apariencia>, sistemaPideContraste: boolean): Apariencia {
  return {
    tema: guardado.tema ?? APARIENCIA_POR_DEFECTO.tema,
    contraste: guardado.contraste ?? (sistemaPideContraste ? 'alto' : 'suave'),
    texto: guardado.texto ?? APARIENCIA_POR_DEFECTO.texto,
  }
}

export type AtributosApariencia = {
  'data-theme': 'light' | 'dark' | null
  'data-contraste': 'alto' | null
  'data-texto': 'grande' | 'enorme' | null
}

/** Atributos de <html>. null = sin atributo (rige el valor por defecto del CSS). */
export function atributosApariencia(a: Apariencia): AtributosApariencia {
  return {
    'data-theme': a.tema === 'claro' ? 'light' : a.tema === 'oscuro' ? 'dark' : null,
    'data-contraste': a.contraste === 'alto' ? 'alto' : null,
    'data-texto': a.texto === 'normal' ? null : a.texto,
  }
}

/** Columnas de `perfiles` donde la cuenta guarda cada ajuste. Nulo = la persona no eligió. */
export type ColumnasApariencia = {
  apariencia_tema: string | null
  apariencia_contraste: string | null
  apariencia_texto: string | null
}

/** Lo que la cuenta tiene guardado. Tolera columnas ausentes: la migración puede llegar después que el código. */
export function aparienciaDeCuenta(cuenta: Partial<ColumnasApariencia>): Partial<Apariencia> {
  return leerGuardado(
    JSON.stringify({
      tema: cuenta.apariencia_tema,
      contraste: cuenta.apariencia_contraste,
      texto: cuenta.apariencia_texto,
    }),
  )
}

/** Nombre de columna de cada ajuste, para escribir en `perfiles`. */
export const COLUMNA_DE: Record<keyof Apariencia, keyof ColumnasApariencia> = {
  tema: 'apariencia_tema',
  contraste: 'apariencia_contraste',
  texto: 'apariencia_texto',
}

/**
 * Al abrir la app con sesión: la cuenta manda sobre el dispositivo, así la apariencia sigue a la
 * persona. Lo que solo existe en el dispositivo (lo elegido antes de que hubiera cuenta) sube a
 * la cuenta una vez, para no perderlo.
 */
export function conciliar(
  dispositivo: Partial<Apariencia>,
  cuenta: Partial<Apariencia>,
): { aplicar: Partial<Apariencia>; subir: Partial<Apariencia> } {
  const aplicar: Partial<Apariencia> = {}
  const subir: Partial<Apariencia> = {}
  for (const clave of Object.keys(COLUMNA_DE) as (keyof Apariencia)[]) {
    const deLaCuenta = cuenta[clave]
    const delDispositivo = dispositivo[clave]
    // `as never`: TypeScript no puede probar que la clave y el valor son del mismo ajuste.
    if (deLaCuenta !== undefined) {
      if (deLaCuenta !== delDispositivo) aplicar[clave] = deLaCuenta as never
    } else if (delDispositivo !== undefined) {
      subir[clave] = delDispositivo as never
    }
  }
  return { aplicar, subir }
}

/**
 * Se ejecuta en <head> antes de pintar, para que la página no aparezca un instante con la letra
 * chica o el tema equivocado. Es la misma regla que leerGuardado + resolverApariencia +
 * atributosApariencia, escrita sin dependencias; una prueba unitaria verifica que coincidan.
 */
export const SCRIPT_APARIENCIA = `(function(){try{
var h=document.documentElement,g={};
try{g=JSON.parse(localStorage.getItem(${JSON.stringify(CLAVE_APARIENCIA)})||'{}')||{}}catch(e){}
if(g.tema==='claro')h.setAttribute('data-theme','light');
else if(g.tema==='oscuro')h.setAttribute('data-theme','dark');
var c=g.contraste==='alto'||(g.contraste!=='suave'&&!!window.matchMedia&&window.matchMedia('(prefers-contrast: more)').matches);
if(c)h.setAttribute('data-contraste','alto');
if(g.texto==='grande'||g.texto==='enorme')h.setAttribute('data-texto',g.texto);
}catch(e){}})();`
