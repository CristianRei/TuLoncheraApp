-- 0018 — Credenciales privadas: el PIN y los datos personales nunca salen
-- de Supabase, y todo lo que puede abrir sesión o cambiar permisos se
-- verifica en el servidor.
--
-- Problema (auditoría 2026-09-25): la app entra con sesión anónima y la anon
-- key viaja en el .apk, así que cualquiera podía leer `usuarios` completa —
-- el PIN de admin en texto plano, y la cédula de los demás (su PIN son los
-- últimos 4 dígitos) —, escribir ahí (ej. cambiarse el rol a ADMIN) e
-- insertar un "desbloqueo" falso para seguir probando PINs en un celular
-- bloqueado.
--
-- Después de esta migración:
--   * `usuarios` queda con lo público (id, nombre, rol, activo) y solo se lee.
--     PIN, cédula, celular y dirección viven en `usuarios_credenciales`, sin
--     ninguna política: la app no la puede ni leer ni escribir.
--   * Iniciar sesión con un PIN que el celular no conoce: `verificar_pin`,
--     con límite de intentos por sesión y en total.
--   * Crear/editar/eliminar personal y desbloquear un dispositivo a
--     distancia exigen el PIN de un ADMIN activo, verificado aquí
--     (`guardar_usuario`, `eliminar_usuario`, `desbloquear_dispositivo`).
--     Devuelven false si el PIN no es válido, en vez de lanzar un error: un
--     error desharía el registro del intento fallido y el límite de intentos
--     dejaría de contar por esa vía.
--   * `registrar_admin` crea o actualiza un admin — SOLO desde el SQL Editor
--     (sin permiso de ejecución para la app). Sirve para dar de alta al
--     primer admin: sin al menos uno registrado, nadie puede sincronizar
--     personal.
--
-- Idempotente: se puede correr varias veces.

-- ---------------------------------------------------------------------------
-- 1. Credenciales privadas
-- ---------------------------------------------------------------------------
create table if not exists usuarios_credenciales (
  usuario_id uuid primary key,
  pin text,
  cedula text,
  celular text,
  direccion text,
  actualizado_ts timestamptz not null default now()
);
alter table usuarios_credenciales enable row level security;
-- Sin políticas a propósito: solo las funciones `security definer` la tocan.
revoke all on usuarios_credenciales from anon, authenticated;

alter table usuarios add column if not exists credencial_version integer not null default 1;

-- Mueve lo que ya estaba expuesto. El PIN derivado de cédula nunca viajaba:
-- se reconstruye igual que en la app (src/core/pin, pinDesdeCedula).
insert into usuarios_credenciales (usuario_id, pin, cedula, celular, direccion)
select u.id,
       coalesce(
         u.pin,
         case when u.rol <> 'ADMIN' and u.cedula is not null
              then nullif(right(regexp_replace(u.cedula, '\D', '', 'g'), 4), '')
         end
       ),
       u.cedula, u.celular, u.direccion
from usuarios u
where u.pin is not null or u.cedula is not null or u.celular is not null or u.direccion is not null
on conflict (usuario_id) do nothing;

update usuarios
set pin = null, cedula = null, celular = null, direccion = null
where pin is not null or cedula is not null or celular is not null or direccion is not null;

-- `usuarios`: solo lectura, y solo de las columnas públicas.
drop policy if exists usuarios_insert_auth on usuarios;
drop policy if exists usuarios_update_auth on usuarios;
drop policy if exists usuarios_delete_auth on usuarios;
revoke insert, update, delete on usuarios from anon, authenticated;
revoke select on usuarios from anon, authenticated;
grant select (id, nombre, rol, activo, ts_cliente, dispositivo_id, subido_ts, credencial_version)
  on usuarios to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Límite de intentos de verificación de PIN
-- ---------------------------------------------------------------------------
create table if not exists intentos_verificacion_pin (
  id bigserial primary key,
  sesion uuid,
  ts timestamptz not null default now()
);
alter table intentos_verificacion_pin enable row level security;
revoke all on intentos_verificacion_pin from anon, authenticated;

-- Un PIN de 4 dígitos tiene 10.000 combinaciones: sin tope, se prueba entero
-- en minutos. Tope por sesión (10 fallos / 10 min) y global (60 fallos /
-- min, porque crear sesiones anónimas nuevas es gratis).
create or replace function _exigir_cupo_de_intentos() returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from intentos_verificacion_pin
      where sesion is not distinct from auth.uid() and ts > now() - interval '10 minutes') >= 10
     or (select count(*) from intentos_verificacion_pin where ts > now() - interval '1 minute') >= 60 then
    raise exception 'DEMASIADOS_INTENTOS' using errcode = 'P0001';
  end if;
end $$;

create or replace function _registrar_intento_fallido() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into intentos_verificacion_pin (sesion) values (auth.uid());
  delete from intentos_verificacion_pin where ts < now() - interval '1 day';
end $$;

-- Admin activo dueño de ese PIN, o null. Cuenta como intento fallido si no.
create or replace function _admin_por_pin(p_pin text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform _exigir_cupo_de_intentos();
  select u.id into v_id
  from usuarios u join usuarios_credenciales c on c.usuario_id = u.id
  where u.rol = 'ADMIN' and u.activo and c.pin = p_pin
  limit 1;
  if v_id is null then
    perform _registrar_intento_fallido();
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Funciones que usa la app
-- ---------------------------------------------------------------------------

-- Login con un PIN que el celular no tiene guardado. Devuelve a lo sumo una
-- persona activa de los roles pedidos — nunca el PIN ni otros datos.
drop function if exists verificar_pin(text, text[]);
create function verificar_pin(p_pin text, p_roles text[])
returns table (id uuid, nombre text, rol text, credencial_version integer, ts_cliente timestamptz, dispositivo_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir_cupo_de_intentos();
  return query
    select u.id, u.nombre, u.rol, u.credencial_version, u.ts_cliente, u.dispositivo_id
    from usuarios u join usuarios_credenciales c on c.usuario_id = u.id
    where u.activo and u.rol = any (p_roles) and c.pin = p_pin
    limit 1;
  if not found then
    perform _registrar_intento_fallido();
  end if;
end $$;

-- Alta/edición de personal desde el dispositivo de admin (cola de sync).
-- p_usuario: {id, nombre, rol, activo, pin, cedula, celular, direccion,
-- ts_cliente, dispositivo_id}. `credencial_version` sube solo si el PIN
-- cambió: así los celulares que tenían el PIN viejo lo olvidan.
create or replace function guardar_usuario(p_admin_pin text, p_usuario jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (p_usuario ->> 'id')::uuid;
  v_pin text := p_usuario ->> 'pin';
  v_pin_previo text;
begin
  if _admin_por_pin(p_admin_pin) is null then
    return false;
  end if;
  select pin into v_pin_previo from usuarios_credenciales where usuario_id = v_id;

  insert into usuarios (id, nombre, rol, activo, ts_cliente, dispositivo_id)
  values (v_id, p_usuario ->> 'nombre', p_usuario ->> 'rol', (p_usuario ->> 'activo')::boolean,
          (p_usuario ->> 'ts_cliente')::timestamptz, (p_usuario ->> 'dispositivo_id')::uuid)
  on conflict (id) do update set
    nombre = excluded.nombre,
    rol = excluded.rol,
    activo = excluded.activo,
    ts_cliente = excluded.ts_cliente,
    dispositivo_id = excluded.dispositivo_id,
    credencial_version = usuarios.credencial_version
      + case when v_pin_previo is distinct from v_pin then 1 else 0 end;

  insert into usuarios_credenciales (usuario_id, pin, cedula, celular, direccion, actualizado_ts)
  values (v_id, v_pin, p_usuario ->> 'cedula', p_usuario ->> 'celular', p_usuario ->> 'direccion', now())
  on conflict (usuario_id) do update set
    pin = excluded.pin, cedula = excluded.cedula, celular = excluded.celular,
    direccion = excluded.direccion, actualizado_ts = now();
  return true;
end $$;

-- "Eliminar definitivamente" (persona sin historial).
create or replace function eliminar_usuario(p_admin_pin text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if _admin_por_pin(p_admin_pin) is null then
    return false;
  end if;
  delete from usuarios_credenciales where usuario_id = p_id;
  delete from usuarios where id = p_id;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Desbloqueo remoto: solo cuenta el verificado
-- ---------------------------------------------------------------------------
alter table desbloqueos_pin add column if not exists verificado boolean not null default false;

-- Un insert directo desde la app (la cola de sync sube los desbloqueos hechos
-- en el mismo dispositivo, como registro) nunca queda verificado; solo
-- `desbloquear_dispositivo`, que corre como dueño de la tabla, puede.
create or replace function fn_desbloqueo_no_verificado() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.verificado := false;
  end if;
  return new;
end $$;
drop trigger if exists trg_desbloqueo_no_verificado on desbloqueos_pin;
create trigger trg_desbloqueo_no_verificado before insert or update on desbloqueos_pin
  for each row execute function fn_desbloqueo_no_verificado();

create or replace function desbloquear_dispositivo(
  p_admin_pin text, p_id uuid, p_dispositivo_id uuid, p_modo text, p_ts_cliente timestamptz
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := _admin_por_pin(p_admin_pin);
begin
  if v_admin is null then
    return false;
  end if;
  insert into desbloqueos_pin (id, dispositivo_id, modo, admin_id, ts_cliente, verificado)
  values (p_id, p_dispositivo_id, p_modo, v_admin, p_ts_cliente, true)
  on conflict (id) do update set verificado = true, admin_id = v_admin;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Alta del primer admin (solo SQL Editor)
-- ---------------------------------------------------------------------------
-- Uso: select registrar_admin('Nombre Apellido', '123456');
-- Si ya hay un admin con ese nombre, le cambia el PIN.
create or replace function registrar_admin(p_nombre text, p_pin text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_pin !~ '^\d{6}$' then
    raise exception 'El PIN de admin debe tener 6 dígitos';
  end if;
  select id into v_id from usuarios where rol = 'ADMIN' and nombre = p_nombre limit 1;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into usuarios (id, nombre, rol, activo, ts_cliente, dispositivo_id)
    values (v_id, p_nombre, 'ADMIN', true, now(), gen_random_uuid());
  else
    update usuarios set activo = true, credencial_version = credencial_version + 1 where id = v_id;
  end if;
  insert into usuarios_credenciales (usuario_id, pin) values (v_id, p_pin)
  on conflict (usuario_id) do update set pin = excluded.pin, actualizado_ts = now();
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quién puede ejecutar qué
-- ---------------------------------------------------------------------------
revoke all on function _exigir_cupo_de_intentos() from public, anon, authenticated;
revoke all on function _registrar_intento_fallido() from public, anon, authenticated;
revoke all on function _admin_por_pin(text) from public, anon, authenticated;
revoke all on function registrar_admin(text, text) from public, anon, authenticated;
revoke all on function verificar_pin(text, text[]) from public, anon;
revoke all on function guardar_usuario(text, jsonb) from public, anon;
revoke all on function eliminar_usuario(text, uuid) from public, anon;
revoke all on function desbloquear_dispositivo(text, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function verificar_pin(text, text[]) to authenticated;
grant execute on function guardar_usuario(text, jsonb) to authenticated;
grant execute on function eliminar_usuario(text, uuid) to authenticated;
grant execute on function desbloquear_dispositivo(text, uuid, uuid, text, timestamptz) to authenticated;
