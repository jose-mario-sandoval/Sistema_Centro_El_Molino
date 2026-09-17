export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; campos?: Record<string, string> }

export function exito<T>(data: T): Resultado<T> {
  return { ok: true, data }
}

export function fallo(error: string, campos?: Record<string, string>): { ok: false; error: string; campos?: Record<string, string> } {
  return { ok: false, error, campos }
}
