-- Notificaciones push enviadas DESDE SUPABASE, no desde el dispositivo del
-- admin. Antes la app del admin llamaba directo a
-- https://exp.host/--/api/v2/push/send; desde el navegador (admin en el
-- computador) esa llamada la bloquea CORS siempre — Expo no devuelve
-- `Access-Control-Allow-Origin` — así que ningún mensaje enviado desde el
-- computador generaba push (ver CLAUDE.md sección 11). Ahora un trigger sobre
-- `mensaje_destinatarios` llama a Expo con `pg_net` (petición HTTP asíncrona:
-- se envía después de confirmar el insert y nunca lo bloquea ni lo hace
-- fallar). Funciona igual desde cualquier dispositivo admin, sin servidor
-- propio.
--
-- Se aplica a mano en el SQL Editor de Supabase, después de 0009.
-- IDEMPOTENTE: se puede correr las veces que haga falta. Si la primera línea
-- falla por permisos, activar `pg_net` en Database → Extensions y volver a
-- correr el archivo.
--
-- Diagnóstico: las respuestas de Expo quedan unas horas en
-- `net._http_response`:
--   select created, status_code, content from net._http_response order by created desc limit 10;
-- Un `DeviceNotRegistered` ahí significa que ese celular desinstaló la app o
-- cambió de token (se corrige solo en su próximo login).

create extension if not exists pg_net with schema extensions;

-- Un envío por mensaje, con todos sus destinatarios en `to` (Expo acepta hasta
-- 100 tokens por mensaje; si hay más, se parte en lotes). Solo tokens activos;
-- `distinct` porque un mismo celular puede tener el token de dos personas.
-- SECURITY DEFINER: quien inserta es la sesión anónima de la app, que no tiene
-- permiso sobre el esquema `net`; la función corre con los permisos de su
-- dueño.
create or replace function fn_enviar_push_de_mensajes() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  envio record;
  desde integer;
begin
  for envio in
    select m.cuerpo,
           case m.tipo when 'META_PROGRESO' then 'Progreso de tu meta' else 'Mensaje del administrador' end as titulo,
           array_agg(distinct t.expo_push_token) as tokens
    from nuevos d
    join mensajes m on m.id = d.mensaje_id
    join push_tokens t on t.usuario_id = d.destinatario_id and t.activo
    group by m.id, m.cuerpo, m.tipo
  loop
    desde := 1;
    while desde <= coalesce(array_length(envio.tokens, 1), 0) loop
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', to_jsonb(envio.tokens[desde:desde + 99]),
          'title', envio.titulo,
          'body', envio.cuerpo,
          'sound', 'default',
          'priority', 'high'
        ),
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
      );
      desde := desde + 100;
    end loop;
  end loop;
  return null;
end $$;

-- Por sentencia (no por fila): un envío a 10 promotores es UNA petición a
-- Expo, no diez.
drop trigger if exists trg_mensaje_destinatarios_push on mensaje_destinatarios;
create trigger trg_mensaje_destinatarios_push
  after insert on mensaje_destinatarios
  referencing new table as nuevos
  for each statement execute function fn_enviar_push_de_mensajes();
