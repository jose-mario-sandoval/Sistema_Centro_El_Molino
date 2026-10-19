-- El enum se confirma en su propia transacción antes de utilizar el valor nuevo.
alter type public.rol add value if not exists 'administradora';
