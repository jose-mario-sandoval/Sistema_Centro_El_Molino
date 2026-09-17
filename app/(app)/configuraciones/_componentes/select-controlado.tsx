'use client'

import { useLayoutEffect, useRef, type ComponentProps } from 'react'

/**
 * `<select>` controlado para formularios con `action`.
 * Después de cada envío React 19 ejecuta `form.reset()`. En los inputs controlados React sincroniza el atributo
 * `value`, así que conservan lo escrito; en un select no sincroniza `defaultSelected`, y el reset lo devuelve a la
 * opción inicial (o a la primera): se vería un valor distinto del estado y el siguiente envío mandaría ese otro.
 * Marcar como `defaultSelected` la opción vigente hace que el reset la conserve.
 */
export function SelectControlado({ value, ...props }: Omit<ComponentProps<'select'>, 'value'> & { value: string }) {
  const select = useRef<HTMLSelectElement>(null)

  useLayoutEffect(() => {
    for (const opcion of select.current?.options ?? []) {
      opcion.defaultSelected = opcion.value === value
    }
  }, [value])

  return <select ref={select} value={value} {...props} />
}
