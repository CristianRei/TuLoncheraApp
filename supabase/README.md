# Supabase — configuración manual

Este directorio documenta lo que vive en Supabase (Postgres + Storage), fuera
del control de las migraciones locales de `src/db/migraciones/`. No hay CLI
de Supabase en este repo — todo se aplica a mano en el dashboard.

## 1. Tablas + RLS + trigger

Correr `migraciones/0001_turnos_y_comprobantes.sql` completo en
**SQL Editor** del dashboard de Supabase, una sola vez.

## 2. Buckets de Storage

En **Storage**, crear dos buckets **privados** (NO marcar "Public bucket"):

- `selfies-turnos`
- `comprobantes-venta`

Para cada uno, en **Policies**, agregar:

- `INSERT` para el rol `authenticated`, sin restricción adicional (`true`).
- `SELECT` para el rol `authenticated`, sin restricción adicional (`true`).
- Sin políticas de `UPDATE` ni `DELETE` — las subidas usan `upsert: true`
  desde el cliente; si el SDK exige permiso explícito de `UPDATE` para que
  el upsert funcione, agregar `UPDATE` para `authenticated` limitado a
  `owner = auth.uid()`.

## 3. Auth

**Authentication → Providers → Anonymous Sign-ins**: activar. Es el único
mecanismo de autenticación que usa esta rebanada (ver
`docs/03-decisiones/0006-sincronizacion-turnos-comprobantes.md`).

## 4. Credenciales para el cliente

De **Settings → API**, copiar a `.env.local` (nunca a un archivo versionado):

- `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
- `anon` / `publishable key` → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Nunca copiar la `service_role` / `secret key`, ni la contraseña de la base
de datos, a ningún archivo de este repo.
