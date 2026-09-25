-- Descuentos (por producto, punto y/o PROMOTOR, con vigencia de fecha y
-- hora) — quinta rebanada de la sincronización de BAJADA, ver CLAUDE.md
-- sección 11. Admin crea o desactiva un descuento en su dispositivo; aquí
-- sube para que el celular del promotor cobre con él: "Cristian hoy de 8 am
-- a 4 pm tiene 10 % en sus productos".
--
-- Se aplica a mano en el SQL Editor de Supabase, después de 0012 (un
-- descuento puede referenciar un punto). IDEMPOTENTE: se puede correr las
-- veces que haga falta.
--
-- `producto_id`/`punto_id`/`promotor_id` NULL = aplica a todos en esa
-- dimensión. `producto_sku` viaja porque los 123 productos iniciales tienen un
-- id distinto en cada dispositivo (el celular los encuentra por sku). El
-- valor y la vigencia nunca se editan (se desactiva y se crea otro): al
-- volver a subirse, lo único que cambia es `activo`. Sin FK hacia productos/
-- puntos/usuarios, mismo criterio que 0012.

create table if not exists descuentos (
  id uuid primary key,                    -- mismo UUID generado en el dispositivo de admin (R3)
  producto_id uuid,
  producto_sku text,
  producto_nombre text,
  punto_id uuid,
  promotor_id uuid,
  promotor_nombre text,
  tipo text not null,                     -- PORCENTAJE | MONTO_FIJO
  valor bigint not null,
  desde timestamptz not null,
  hasta timestamptz not null,
  activo boolean not null,
  creado_por uuid not null,
  creado_por_nombre text,
  ts_cliente timestamptz not null,
  dispositivo_id uuid not null,
  subido_ts timestamptz not null default now()
);

alter table descuentos enable row level security;

-- Mismo modelo de confianza que el resto (CLAUDE.md sección 4). Sin DELETE: un
-- descuento se desactiva (activo = false), nunca se borra.
drop policy if exists "descuentos_select_auth" on descuentos;
create policy "descuentos_select_auth" on descuentos for select to authenticated using (true);
drop policy if exists "descuentos_insert_auth" on descuentos;
create policy "descuentos_insert_auth" on descuentos for insert to authenticated with check (true);
drop policy if exists "descuentos_update_auth" on descuentos;
create policy "descuentos_update_auth" on descuentos for update to authenticated using (true) with check (true);

-- Cursor de descarga: `subido_ts` = hora del SERVIDOR en cada insert/update
-- (mismo trigger que 0009/0014; se redefine aquí para no depender de ellas).
create or replace function fn_tocar_subido_ts() returns trigger language plpgsql as $$
begin
  new.subido_ts := now();
  return new;
end $$;

drop trigger if exists trg_descuentos_subido on descuentos;
create trigger trg_descuentos_subido before insert or update on descuentos
  for each row execute function fn_tocar_subido_ts();

create index if not exists idx_descuentos_subido on descuentos (subido_ts);

-- Realtime: un descuento asignado ahora cambia los precios del promotor al instante.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'descuentos'
  ) then
    alter publication supabase_realtime add table public.descuentos;
  end if;
end $$;

notify pgrst, 'reload schema';
