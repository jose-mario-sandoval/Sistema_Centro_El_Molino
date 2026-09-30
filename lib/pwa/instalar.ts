import { esIOS } from '@/lib/push/plataforma'

/*
 * Invitación a instalar El Molino en el teléfono y, ya instalada, a activar los avisos (plan
 * 2026-09-29). Todo lo que decide qué se muestra es puro y está probado; el script de <head> repite
 * la misma regla sin dependencias (como SCRIPT_APARIENCIA) y una prueba verifica que coincidan.
 */

/** "Ahora no" (instalar), en milisegundos desde 1970. */
export const CLAVE_INSTALAR_DESCARTADA = 'molino-instalar-descartada'
/** "Ahora no" (avisos después de instalar). */
export const CLAVE_AVISOS_DESCARTADOS = 'molino-avisos-descartados'
/** '1' después de `appinstalled` en este dispositivo. */
export const CLAVE_INSTALADA = 'molino-instalada'

export const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

/** Android (teléfono o tablet) y demás navegadores móviles. iPhone e iPad los decide `esIOS`. */
const PATRON_MOVIL = /Android|Mobi|Tablet|Silk|Kindle/i

export type Aparato = { userAgent: string; maxTouchPoints: number }

/** Teléfono o tablet: donde tiene sentido instalar la app. Nunca una computadora. */
export function esTelefonoOTablet(p: Aparato): boolean {
  return esIOS(p) || PATRON_MOVIL.test(p.userAgent)
}

/**
 * En el servidor solo está el User-Agent: ¿puede ser un teléfono o tablet? "Macintosh" cuenta,
 * porque el iPad con Safari se presenta así; el script de <head> lo termina de decidir con la
 * pantalla táctil. En escritorio el servidor no pinta nada.
 */
export function puedeSerMovil(userAgent: string | null): boolean {
  if (!userAgent) return false
  return esTelefonoOTablet({ userAgent, maxTouchPoints: 5 })
}

/**
 * "tu teléfono" o "tu tablet", para el texto de la invitación (lo pinta el servidor). Si un
 * "Macintosh" llega a verla es porque es un iPad: en una Mac el script de <head> no la muestra.
 */
export function nombreAparato(userAgent: string | null): 'teléfono' | 'tablet' {
  const ua = userAgent ?? ''
  if (/iPad|Macintosh/.test(ua)) return 'tablet'
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return 'tablet'
  return 'teléfono'
}

/**
 * - `nativa`: el navegador ofrece instalar (`beforeinstallprompt`): el botón llama a `prompt()`.
 * - `ios`: iPhone o iPad, que solo instalan desde Compartir → "Agregar a pantalla de inicio".
 * - `generica`: cualquier otro, y Chrome mientras todavía no disparó el evento.
 */
export type VarianteInstalar = 'nativa' | 'ios' | 'generica'

export function varianteInstalar(p: { ios: boolean; hayPromptNativo: boolean }): VarianteInstalar {
  if (p.hayPromptNativo) return 'nativa'
  return p.ios ? 'ios' : 'generica'
}

/** ¿Se tocó "Ahora no" hace menos de 7 días? Un valor inválido o en el futuro no cuenta. */
export function sigueDescartada(guardado: string | null, ahora: number): boolean {
  if (guardado === null || guardado === '') return false
  const cuando = Number(guardado)
  if (!Number.isFinite(cuando)) return false
  const pasaron = ahora - cuando
  return pasaron >= 0 && pasaron < SIETE_DIAS_MS
}

export function debeOfrecerInstalar(p: {
  movil: boolean
  standalone: boolean
  instalada: boolean
  descartadaEn: string | null
  ahora: number
}): boolean {
  return p.movil && !p.standalone && !p.instalada && !sigueDescartada(p.descartadaEn, p.ahora)
}

/**
 * Ya instalada, ¿se ofrecen los avisos? Solo si el permiso sigue sin pedir: si lo concedió y después
 * los desactivó en Ajustes fue a propósito, y si los bloqueó, Ajustes explica cómo desbloquearlos.
 */
export function debeOfrecerAvisos(p: {
  movil: boolean
  standalone: boolean
  pushDisponible: boolean
  conLlave: boolean
  permiso: 'default' | 'granted' | 'denied' | null
  descartadaEn: string | null
  ahora: number
}): boolean {
  return (
    p.movil &&
    p.standalone &&
    p.pushDisponible &&
    p.conLlave &&
    p.permiso === 'default' &&
    !sigueDescartada(p.descartadaEn, p.ahora)
  )
}

// ---------- iPhone y iPad ----------

export type NavegadorIOS = { aparato: 'iphone' | 'ipad'; safari: boolean }

/** Chrome, Edge, Firefox y otros en iOS se anuncian con su nombre además de "Safari". */
const OTROS_NAVEGADORES_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|GSA\/|DuckDuckGo|Brave/

export function navegadorIOS(p: Aparato): NavegadorIOS {
  const ipad = /iPad/.test(p.userAgent) || (/Macintosh/.test(p.userAgent) && p.maxTouchPoints > 1)
  return { aparato: ipad ? 'ipad' : 'iphone', safari: !OTROS_NAVEGADORES_IOS.test(p.userAgent) }
}

export type PasoIOS = { titulo: string; detalle: string }

/** Dónde está Compartir: abajo en el iPhone con Safari; arriba en el iPad y en los demás navegadores. */
function dondeCompartir(n: NavegadorIOS): string {
  if (!n.safari) return 'Está arriba, en la barra de la dirección. En algunos navegadores está dentro del botón\u00a0⋯.'
  if (n.aparato === 'ipad') return 'Está arriba, a la derecha. Si no lo ves, tocá primero el botón\u00a0⋯.'
  return 'Está abajo, en la barra de Safari. Si no lo ves, tocá primero el botón\u00a0⋯.'
}

export function pasosIOS(n: NavegadorIOS): PasoIOS[] {
  return [
    { titulo: 'Tocá el botón Compartir', detalle: dondeCompartir(n) },
    {
      titulo: 'Elegí «Agregar a pantalla de inicio»',
      detalle: 'Si no aparece, deslizá la lista hacia arriba. Después tocá «Agregar».',
    },
    { titulo: 'Abrí El Molino desde el ícono nuevo', detalle: 'Queda en la pantalla de inicio, junto a tus otras apps.' },
  ]
}

export const REQUISITO_IOS = 'Requiere iOS 16.4 o posterior para los avisos.'
export const PASOS_GENERICOS =
  'Abrí el menú del navegador (⋮\u00a0o\u00a0⋯) y elegí «Instalar app» o «Agregar a pantalla de inicio».'

// ---------- Script de <head> ----------

/**
 * Corre antes de pintar, en todas las páginas (app/layout.tsx):
 * 1. Pone `data-instalar="ofrecer"` en <html> si corresponde invitar a instalar, y
 *    `data-ofrecer-avisos="si"` si, ya instalada, corresponde ofrecer los avisos. El CSS muestra la
 *    franja solo con ese atributo: se ve desde el primer pintado, sin saltos ni diferencias con el
 *    HTML del servidor.
 * 2. Captura `beforeinstallprompt` apenas llega (puede llegar en /login o antes de que React
 *    hidrate): lo deja en `window.__molinoInstalar` y avisa con `molino:instalable`.
 * 3. Tras `appinstalled`, lo anota en el dispositivo.
 * Es la misma regla que debeOfrecerInstalar / debeOfrecerAvisos, escrita sin dependencias.
 */
export function scriptInstalacion({ conAvisos }: { conAvisos: boolean }): string {
  return `(function(){try{
var h=document.documentElement,w=window,n=navigator,u=n.userAgent||'',t=n.maxTouchPoints||0;
var movil=/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&t>1)||new RegExp(${JSON.stringify(PATRON_MOVIL.source)},'i').test(u);
var sa=(!!w.matchMedia&&w.matchMedia('(display-mode: standalone)').matches)||n.standalone===true;
function leer(k){try{return w.localStorage.getItem(k)}catch(e){return null}}
function anotar(k,v){try{w.localStorage.setItem(k,v)}catch(e){}}
function descartada(v){if(v===null||v==='')return false;var x=Number(v);if(!isFinite(x))return false;var d=Date.now()-x;return d>=0&&d<${SIETE_DIAS_MS}}
if(movil&&!sa&&leer(${JSON.stringify(CLAVE_INSTALADA)})!=='1'&&!descartada(leer(${JSON.stringify(CLAVE_INSTALAR_DESCARTADA)})))h.setAttribute('data-instalar','ofrecer');
var push=('serviceWorker' in n)&&('PushManager' in w)&&('Notification' in w);
var permiso=push?w.Notification.permission:null;
if(${conAvisos ? 'true' : 'false'}&&movil&&sa&&push&&permiso==='default'&&!descartada(leer(${JSON.stringify(CLAVE_AVISOS_DESCARTADOS)})))h.setAttribute('data-ofrecer-avisos','si');
w.__molinoInstalar=null;
w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();w.__molinoInstalar=e;try{w.dispatchEvent(new Event('molino:instalable'))}catch(x){}});
w.addEventListener('appinstalled',function(){w.__molinoInstalar=null;anotar(${JSON.stringify(CLAVE_INSTALADA)},'1')});
}catch(e){}})();`
}
