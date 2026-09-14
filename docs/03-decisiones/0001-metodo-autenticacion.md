# ADR 0001 — Método de autenticación

**Estado:** Aceptado

## Contexto

`CLAUDE.md` sección 11 dejaba abierta la pregunta de cómo autenticar a los
usuarios: PIN, usuario/contraseña, o biométrica. Los promotores necesitan
entrar rápido durante un evento (sin señal, sin tiempo que perder), mientras
que admin y bodega manejan operaciones más sensibles (`RETIRO_ADMIN`,
aprobar descuadres, ver costos).

La primera propuesta fue: todo usuario entra con un código de 4 dígitos, y
además admin/bodega tienen que escribir una contraseña. Se descartó: obliga a
esas personas a recordar y escribir dos códigos para entrar, lo cual es
fricción real sin un beneficio de seguridad correspondiente — `CLAUDE.md`
sección 4 ya documenta que, mientras la app sea local, cualquiera con acceso
físico al dispositivo puede manipular el SQLite directamente sin pasar por la
UI. Una contraseña adicional no cambia ese modelo de amenaza hoy.

## Decisión

- **Un solo campo en toda la app: un PIN numérico de 4 dígitos.** Nunca se
  pide contraseña, para ningún rol.
- Para promotores, el PIN son por convención los últimos 4 dígitos de su
  cédula.
- La pantalla de login tiene un modo por defecto (busca el PIN entre
  promotores) y dos botones, "Ingresar como administrador" / "Ingresar como
  bodega", que cambian el modo: el mismo campo de PIN, pero la búsqueda queda
  acotada a usuarios de ese rol específico.
- `usuarios.pin` tiene un índice `UNIQUE` en la base de datos (migración
  `0003_pin_unico`), así que si dos usuarios terminan con el mismo PIN, falla
  al crear el segundo usuario en vez de fallar en silencio en el login.
- La sesión (usuario actual) vive en memoria (React Context), no se persiste
  entre reinicios de la app. Volver a abrir la app pide el PIN de nuevo —
  fricción mínima y evita meter `AsyncStorage` u otra dependencia solo para
  esto.

## Consecuencias

- Login más rápido para promotores (el caso de uso más frecuente).
- El modelo de seguridad del login es explícitamente débil — es UX, no
  autorización real — igual que ya lo advierte `CLAUDE.md` sección 4 para
  toda la app en esta fase local.
- El espacio de PINs (10.000 combinaciones) es suficiente para el tamaño
  actual del equipo. Si el número de promotores crece mucho, revisar si hace
  falta ampliar el PIN o cambiar el esquema.
- `CONDUCTOR` no tiene modo de login propio todavía — se agrega cuando ese
  rol tenga una pantalla real que mostrar.
- Cuando exista servidor (Fase 5), este mecanismo pasa a ser solo UX y la
  autoridad real se mueve al backend, consistente con la nota de la sección 4.
