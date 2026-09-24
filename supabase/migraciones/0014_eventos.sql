-- Eventos del calendario (con sus promotores y la meta diaria de cada uno) —
-- cuarta rebanada de la sincronización de BAJADA, ver CLAUDE.md sección 11.
-- Admin planea eventos en su dispositivo; aquí suben para que el celular del
-- promotor vea su calendario, resuelva su punto vigente (la venta queda con
-- punto y el admin la ve por punto) y vea su meta del día.
--
-- Se aplica a mano en el SQL Editor de Supabase, después de 0012 (los eventos
-- referencian empresas y puntos). IDEMPOTENTE: se puede correr las veces que
-- haga falta.
--
-- Los promotores asignados van DENTRO del evento (`promotores`, jsonb:
-- [{promotor_id, promotor_nombre, meta_diaria}]) en vez de una tabla aparte:
-- reasignar o cambiar una meta reemplaza el conjunto completo, y así cada
-- subida es un solo upsert atómico — nunca un evento a medias ni hace falta
-- permitir DELETE. Sin FK hacia empresas/puntos, mismo criterio que 0012 (al
-- subir un evento la app sube antes su punto y su empresa).

create table if not exists eventos (
  id uuid primary key,                    -- mismo UUID generado en el dispositivo de admin (R3)
  empresa_id uuid not null,
  punto_id uuid not null,
  fecha date not null,
  estado text not null,                   -- PLANEADO | EN_CURSO | CERRADO | CANCELADO
  motivo_cancelacion text,
  serie_id uuid,                          -- trazabilidad de una serie recurrente (no baja al celular)
  creado_por uuid not null,
  creado_por_nombre text,
  promotores jsonb not null default '[]'::jsonb,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

alter table eventos enable row level security;

-- Mismo modelo de confianza que el resto (CLAUDE.md sección 4). Sin DELETE: un
-- evento se cancela (estado = CANCELADO), nunca se borra.
drop policy if exists "eventos_select_auth" on eventos;
create policy "eventos_select_auth" on eventos for select to authenticated using (true);
drop policy if exists "eventos_insert_auth" on eventos;
create policy "eventos_insert_auth" on eventos for insert to authenticated with check (true);
drop policy if exists "eventos_update_auth" on eventos;
create policy "eventos_update_auth" on eventos for update to authenticated using (true) with check (true);

-- Cursor de descarga: `subido_ts` = hora del SERVIDOR en cada insert/update
-- (mismo trigger que ventas/cargues en 0009; se redefine aquí para que este
-- archivo no dependa de que 0009 siga igual).
create or replace function fn_tocar_subido_ts() returns trigger language plpgsql as $$
begin
  new.subido_ts := now();
  return new;
end $$;

drop trigger if exists trg_eventos_subido on eventos;
create trigger trg_eventos_subido before insert or update on eventos
  for each row execute function fn_tocar_subido_ts();

create index if not exists idx_eventos_subido on eventos (subido_ts);

-- Realtime: el calendario del promotor se actualiza al instante.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eventos'
  ) then
    alter publication supabase_realtime add table public.eventos;
  end if;
end $$;

-- Que la API vea la tabla nueva de inmediato (evita "Could not find the table
-- ... in the schema cache").
notify pgrst, 'reload schema';
