-- Clientes finales — el promotor los registra en campo (app/promotor/clientes/)
-- y hasta ahora eran 100% locales: el admin nunca los veía si se creaban en
-- otro dispositivo (pedido explícito del usuario, 2026-09-26).
--
-- Dirección de SUBIDA (celular del promotor → Supabase), como ventas o
-- turnos. El admin los DESCARGA (`descargarClientesNuevos`, solo su
-- dispositivo, nunca Promotor/Bodega: ellos ya son la fuente de la fila que
-- crearon) con Realtime, igual que ventas/cargues/movimientos.
--
-- El id lo genera el celular (R3) y viaja tal cual: a diferencia de
-- productos/categorías, un cliente no viene de ninguna carga inicial, así
-- que no hay ids duplicados entre dispositivos que reconciliar por clave
-- natural — el upsert es directo por id.
--
-- Se aplica a mano en el SQL Editor, después de 0009. IDEMPOTENTE.

create table if not exists clientes (
  id uuid primary key,
  nombre_completo text not null,
  telefono text,
  direccion text,
  ciudad text,
  empresa text,
  nota text,
  creado_por uuid not null,
  creado_por_nombre text not null,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

alter table clientes enable row level security;

-- Mismo modelo de confianza que el resto (CLAUDE.md sección 4): cualquier
-- sesión autenticada puede leer/insertar/actualizar. DELETE incluido: admin
-- borra un cliente real (`eliminarCliente`) igual en Supabase — un cliente no
-- es parte del libro de inventario (R1/R2 no aplican), mismo criterio que ya
-- vale para el DELETE local.
drop policy if exists "clientes_select_auth" on clientes;
create policy "clientes_select_auth" on clientes for select to authenticated using (true);
drop policy if exists "clientes_insert_auth" on clientes;
create policy "clientes_insert_auth" on clientes for insert to authenticated with check (true);
drop policy if exists "clientes_update_auth" on clientes;
create policy "clientes_update_auth" on clientes for update to authenticated using (true) with check (true);
drop policy if exists "clientes_delete_auth" on clientes;
create policy "clientes_delete_auth" on clientes for delete to authenticated using (true);

-- Realtime: el admin ve un cliente nuevo sin refrescar, igual que ventas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clientes'
  ) then
    execute 'alter publication supabase_realtime add table public.clientes';
  end if;
end $$;

-- Que la API vea la tabla nueva de inmediato.
notify pgrst, 'reload schema';
