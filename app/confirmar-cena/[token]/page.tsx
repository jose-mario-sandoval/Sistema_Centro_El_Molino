import { ETIQUETA_TIEMPO } from '@/lib/comidas/tipos'
import { crearClientePublico } from '@/lib/supabase/publico'
import { FormularioConfirmarCena } from './_componentes/formulario-confirmar'

export default async function PaginaConfirmarCena({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = crearClientePublico()
  const { data } = await supabase.rpc('info_enlace_confirmacion', { p_token: token }).maybeSingle()

  return (
    <main className="pagina-publica">
      <div className="card">
        {!data ? (
          <p className="aviso">Este enlace no es válido.</p>
        ) : (
          <>
            <h1>{data.evento_titulo}</h1>
            <p>
              {data.fecha} · {ETIQUETA_TIEMPO[data.tiempo_comida]}
              {data.hora ? ` · ${data.hora}` : ''}
            </p>
            {data.vigente ? <FormularioConfirmarCena token={token} /> : <p className="aviso">Este enlace ya venció.</p>}
          </>
        )}
      </div>
    </main>
  )
}
