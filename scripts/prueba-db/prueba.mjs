// Prueba de integración con SQLite REAL (node:sqlite, Node >= 22.5): corre las
// migraciones de verdad y los flujos de negocio de src/db, con un Supabase
// falso, y compara lo que se sube contra las columnas de supabase/migraciones.
// Existe porque `tsc`/lint/bundle no detectan errores de esquema — un CHECK
// viejo en `_sync_pendiente` hizo fallar toda venta en el celular sin que
// nada lo advirtiera. Correr con `npm run test:db` (no entra en `npm test`).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..').replaceAll('\\', '/');
const SRC = `${RAIZ}/src`;
const imp = (rel) => import(pathToFileURL(`${SRC}/${rel}`).href);

let fallos = 0;
async function paso(nombre, fn) {
  try {
    await fn();
    console.log('OK   ', nombre);
  } catch (e) {
    fallos++;
    console.log('FALLA', nombre, '\n      ', String(e.message).split('\n').slice(0, 3).join('\n       '));
  }
}

function crearDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  return {
    raw,
    async execAsync(sql) { raw.exec(sql); },
    async runAsync(sql, params = []) { const r = raw.prepare(sql).run(...params); return { changes: r.changes, lastInsertRowId: r.lastInsertRowid }; },
    async getAllAsync(sql, params = []) { return raw.prepare(sql).all(...params).map((f) => ({ ...f })); },
    async getFirstAsync(sql, params = []) { const f = raw.prepare(sql).get(...params); return f ? { ...f } : null; },
    async withTransactionAsync(fn) {
      raw.exec('BEGIN');
      try { await fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

function crearFake() {
  // Supabase falso: guarda filas, simula lo que hacen los triggers de
  // supabase/migraciones/0009 (subido_ts del servidor, las líneas "tocan" a su
  // cabecera, una línea ENTREGADA no retrocede) y avisa a los canales Realtime.
  let reloj = 0;
  const ahora = () => new Date(Date.UTC(2026, 8, 23, 12, 0, 0) + ++reloj * 1000).toISOString();
  const tablas = new Map();
  const capturas = [];
  const canales = [];
  const t = (n) => { if (!tablas.has(n)) tablas.set(n, new Map()); return tablas.get(n); };
  const PADRES = { venta_items: ['ventas', 'venta_id'], cargue_lineas: ['cargues', 'cargue_id'], conteo_lineas: ['conteos', 'conteo_id'] };
  const CON_SUBIDO = new Set(['ventas', 'movimientos', 'cargues', 'conteos', 'eventos']);

  function avisar(nombre) {
    for (const c of canales) for (const h of c.handlers) if (h.filtro.table === nombre) h.cb({ table: nombre });
  }
  function guardar(nombre, r) {
    const k = r.id ?? `${r.venta_id ?? r.conteo_id ?? r.mensaje_id}:${r.producto_id ?? r.destinatario_id}`;
    const previo = t(nombre).get(k);
    const fila = { ...(previo ?? {}), ...r };
    if (nombre === 'cargue_lineas' && previo?.estado === 'ENTREGADA' && fila.estado !== 'ENTREGADA') {
      fila.estado = previo.estado; fila.cantidad_entregada = previo.cantidad_entregada; fila.motivo_revision = previo.motivo_revision;
    }
    if (nombre === 'cargues' && previo?.estado === 'ENTREGADO' && fila.estado !== 'ENTREGADO') fila.estado = previo.estado;
    if (CON_SUBIDO.has(nombre)) fila.subido_ts = ahora();
    t(nombre).set(k, fila);
    avisar(nombre);
    if (PADRES[nombre]) {
      const [tp, col] = PADRES[nombre];
      const padre = t(tp).get(fila[col]);
      if (padre) { padre.subido_ts = ahora(); avisar(tp); }
    }
  }

  class Consulta {
    constructor(nombre) { this.n = nombre; this.filtros = []; this.orden = null; this.max = null; }
    select() { return this; }
    returns() { return this; }
    eq(c, v) { this.filtros.push((r) => r[c] === v); return this; }
    is(c, v) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
    in(c, vs) { this.filtros.push((r) => vs.includes(r[c])); return this; }
    gt(c, v) { this.filtros.push((r) => new Date(r[c]).getTime() > new Date(v).getTime()); return this; }
    gte(c, v) { this.filtros.push((r) => new Date(r[c]).getTime() >= new Date(v).getTime()); return this; }
    or(expr) {
      const conds = expr.split(',').map((p) => { const [c, , ...v] = p.split('.'); return (r) => r[c] === v.join('.'); });
      this.filtros.push((r) => conds.some((f) => f(r)));
      return this;
    }
    order(c, o = {}) { this.orden = [c, o.ascending !== false]; return this; }
    limit(n) { this.max = n; return this; }
    then(res, rej) {
      let filas = [...t(this.n).values()].filter((r) => this.filtros.every((f) => f(r))).map((r) => ({ ...r }));
      if (this.orden) {
        const [c, asc] = this.orden;
        filas.sort((a, b) => (new Date(a[c]) - new Date(b[c])) * (asc ? 1 : -1));
      }
      if (this.max) filas = filas.slice(0, this.max);
      return Promise.resolve({ data: filas, error: null }).then(res, rej);
    }
  }

  return {
    tablas, capturas, canales,
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    channel() {
      const c = { handlers: [], on(_tipo, filtro, cb) { this.handlers.push({ filtro, cb }); return this; }, subscribe(cb) { cb?.('SUBSCRIBED'); return this; } };
      canales.push(c);
      return c;
    },
    removeChannel(c) { const i = canales.indexOf(c); if (i >= 0) canales.splice(i, 1); },
    from(nombre) {
      const consulta = new Consulta(nombre);
      consulta.upsert = async (rows) => {
        for (const r of Array.isArray(rows) ? rows : [rows]) { guardar(nombre, r); capturas.push({ tabla: nombre, fila: r }); }
        return { error: null };
      };
      consulta.insert = consulta.upsert;
      consulta.delete = () => ({ eq: async (col, val) => { for (const [k, r] of t(nombre)) if (r[col] === val) t(nombre).delete(k); return { error: null }; } });
      return consulta;
    },
  };
}

async function cargarMigraciones() {
  const dir = `${SRC}/db/migraciones`;
  const out = [];
  for (const f of readdirSync(dir).filter((x) => /^\d{4}_.*\.ts$/.test(x)).sort()) {
    const m = await import(pathToFileURL(`${dir}/${f}`).href);
    out.push(Object.values(m).find((v) => v && typeof v === 'object' && 'version' in v));
  }
  return out.sort((a, b) => a.version - b.version);
}
async function aplicar(db, migs) {
  for (const m of migs) await db.withTransactionAsync(async () => { await m.up(db); });
}

// ---- esquema de Supabase, leído de los .sql reales (en orden de archivo) ----
function esquemaSupabase() {
  const esquema = new Map();
  const dir = `${RAIZ}/supabase/migraciones`;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(`${dir}/${f}`, 'utf8');
    for (const m of sql.matchAll(/create table (?:if not exists )?(\w+) \(([\s\S]*?)\n\);/g)) {
      const cols = new Map();
      for (let linea of m[2].split('\n')) {
        linea = linea.replace(/--.*$/, '').trim().replace(/,$/, '');
        if (!linea || /^(primary key|unique|constraint)/i.test(linea)) continue;
        const [nombre] = linea.split(/\s+/);
        const requerida = /not null|primary key/i.test(linea) && !/default/i.test(linea);
        cols.set(nombre, requerida);
      }
      esquema.set(m[1], cols);
    }
    for (const m of sql.matchAll(/alter table (\w+) add column if not exists (\w+) /g)) {
      esquema.get(m[1])?.set(m[2], false);
    }
  }
  return esquema;
}

const { getDispositivoId } = await imp('db/dispositivo.ts');
const { encolarSync } = await imp('db/syncCola.ts');
const migs = await cargarMigraciones();

console.log('\n== A. El error del celular: la cola solo aceptaba turnos/comprobantes ==');
const dbA = crearDb();
await aplicar(dbA, migs.filter((m) => m.version <= 24));
await dbA.runAsync(`INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES ('t1','turnos','e1','FILA','2026-01-01')`);
await paso('ANTES de la 0025, encolar una venta falla con CHECK (reproduce el error)', async () => {
  let msg = '';
  try { await encolarSync(dbA, { tabla: 'ventas', entidadId: 'x', tipoTarea: 'FILA' }); } catch (e) { msg = e.message; }
  assert.match(msg, /CHECK constraint failed/);
});
await aplicar(dbA, migs.filter((m) => m.version >= 25));
await paso('DESPUES de la 0025, la tarea vieja de turnos se conserva', async () => {
  const f = await dbA.getFirstAsync(`SELECT count(*) n FROM _sync_pendiente WHERE id='t1'`);
  assert.equal(f.n, 1);
});
await paso('DESPUES de la 0025, se puede encolar cualquier tabla', async () => {
  for (const tabla of ['turnos','comprobantes_venta','ventas','movimientos','lotes','cargues','traslados','conteos','arqueos_caja','usuarios','productos','categorias','empresas','puntos','eventos','intentos_pin_fallidos','desbloqueos_pin','logins_exitosos_pin'])
    await encolarSync(dbA, { tabla, entidadId: 'x', tipoTarea: 'FILA' });
});
await dbA.runAsync('DELETE FROM _sync_pendiente');

console.log('\n== B. Flujos reales en el dispositivo del admin (SQLite real) ==');
const { sembrarUsuariosDePrueba } = await imp('db/seed.ts');
const dispA = await getDispositivoId(dbA);
await sembrarUsuariosDePrueba(dbA, dispA);
const promotor = await dbA.getFirstAsync(`SELECT id, nombre FROM usuarios WHERE pin='8509'`);
const bodega = await dbA.getFirstAsync(`SELECT id FROM usuarios WHERE pin='1234'`);
const admin = await dbA.getFirstAsync(`SELECT id FROM usuarios WHERE pin='000000'`);
const tl001 = await dbA.getFirstAsync(`SELECT id, nombre FROM productos WHERE sku='TL001'`);

const { iniciarTurno, finalizarTurno } = await imp('db/turnos.ts');
const { registrarEntradaBodega } = await imp('db/entradasBodega.ts');
const { crearCargue, confirmarLineaCargue } = await imp('db/cargues.ts');
const { registrarVenta, anularVenta } = await imp('db/ventas.ts');
const { registrarConteo } = await imp('db/conteos.ts');
const { registrarArqueoCaja } = await imp('db/arqueos.ts');

let turno, venta;
await paso('iniciar turno', async () => { turno = await iniciarTurno(dbA, { promotorId: promotor.id, selfieUri: 'file:///s.jpg', latitud: 1, longitud: 1 }, dispA); });
await paso('bodega: ingresar pedido con vencimiento (lote + movimiento)', async () => {
  await registrarEntradaBodega(dbA, { usuarioId: bodega.id, items: [{ productoId: tl001.id, cantidad: 50, fechaVencimiento: '2027-01-01' }] }, dispA);
});
await paso('admin planea cargue y bodega lo entrega (RECARGA)', async () => {
  await crearCargue(dbA, { promotorId: promotor.id, promotorNombre: promotor.nombre, items: [{ productoId: tl001.id, cantidad: 10 }], creadoPor: admin.id }, dispA);
  const linea = await dbA.getFirstAsync('SELECT id FROM cargue_lineas LIMIT 1');
  await confirmarLineaCargue(dbA, { lineaId: linea.id, cantidadEntregada: 10, ejecutorId: bodega.id }, dispA);
});

await paso('PROMOTOR: registrar venta en efectivo (el flujo que fallaba en el celular)', async () => {
  venta = await registrarVenta(dbA, { promotorId: promotor.id, promotorNombre: promotor.nombre, items: [{ productoId: tl001.id, productoNombre: tl001.nombre, cantidad: 2, precioUnitario: 3000 }], metodoPago: 'EFECTIVO' }, dispA);
});
await paso('PROMOTOR: venta por transferencia con comprobante', async () => {
  await registrarVenta(dbA, { promotorId: promotor.id, promotorNombre: promotor.nombre, items: [{ productoId: tl001.id, productoNombre: tl001.nombre, cantidad: 1, precioUnitario: 3000 }], metodoPago: 'TRANSFERENCIA', comprobanteUri: 'file:///c.jpg' }, dispA);
});
await paso('PROMOTOR: venta por libranza', async () => {
  await registrarVenta(dbA, { promotorId: promotor.id, promotorNombre: promotor.nombre, items: [{ productoId: tl001.id, productoNombre: tl001.nombre, cantidad: 1, precioUnitario: 3000 }], metodoPago: 'LIBRANZA' }, dispA);
});
await paso('conteo de cierre con descuadre (AJUSTE_CONTEO)', async () => {
  await registrarConteo(dbA, { promotorId: promotor.id, promotorNombre: promotor.nombre, lineas: [{ productoId: tl001.id, contado: 4 }] }, dispA);
});
await paso('admin anula una venta', async () => { await anularVenta(dbA, { ventaId: venta.id, adminId: admin.id, motivo: 'prueba' }, dispA); });
await paso('cerrar turno + arqueo de caja', async () => {
  await finalizarTurno(dbA, { turnoId: turno.id });
  await registrarArqueoCaja(dbA, { turnoId: turno.id, promotorId: promotor.id, efectivoTeorico: 6000, efectivoContado: 5500, totalTransferencia: 3000, totalLibranza: 3000 }, dispA);
});

const { registrarIntentoFallido, registrarLoginExitoso, registrarDesbloqueo } = await imp('db/intentosPin.ts');
await paso('seguridad de PIN: intento fallido, login exitoso y desbloqueo de admin', async () => {
  await registrarIntentoFallido(dbA, dispA, 'PROMOTOR');
  await registrarLoginExitoso(dbA, dispA, 'PROMOTOR');
  await registrarDesbloqueo(dbA, dispA, 'PROMOTOR', admin.id);
});

const { generarNotificaciones } = await imp('db/notificaciones.ts');
await paso('desbloqueo de PIN genera notificación DESBLOQUEO_PIN (evento puntual, no se auto-resuelve)', async () => {
  const [notif] = await dbA.getAllAsync(
    `SELECT id, tipo, resuelta FROM notificaciones WHERE tipo='DESBLOQUEO_PIN' AND dispositivo_id=? AND modo='PROMOTOR'`,
    [dispA]
  );
  assert.ok(notif, 'no se encontró la notificación de desbloqueo');
  assert.equal(notif.resuelta, 0);

  // A diferencia de STOCK_BAJO/LOTE_POR_VENCER/CARGUE_REVISAR, un
  // desbloqueo es un evento puntual: no debe resolverse solo porque
  // generarNotificaciones vuelva a correr (no hay ninguna condición
  // recalculable de la que "dejar de cumplirse").
  await generarNotificaciones(dbA, dispA);
  const fila = await dbA.getFirstAsync('SELECT resuelta FROM notificaciones WHERE id=?', [notif.id]);
  assert.equal(fila.resuelta, 0, 'una notificación de evento puntual no debe auto-resolverse');
});

console.log('\n== C. Admin: catálogo y personal (lo que se sube) ==');
const { crearCategoria } = await imp('db/categorias.ts');
const { crearProducto, actualizarProducto } = await imp('db/productos.ts');
const { crearPersona } = await imp('db/personal.ts');
const galletasA = await dbA.getFirstAsync(`SELECT id FROM categorias WHERE nombre_normalizado='galletas'`);
let catNueva;
await paso('crear categoría nueva', async () => { catNueva = await crearCategoria(dbA, 'Snacks nuevos', dispA); });
await paso('crear producto nuevo en esa categoría', async () => { await crearProducto(dbA, { nombre: 'PRODUCTO NUEVO', precio: 4500, categoriaId: catNueva.id, codigoBarras: '770123' }, dispA); });
await paso('editar precio/marca/categoría de un producto del catálogo inicial', async () => { await actualizarProducto(dbA, tl001.id, { precio: 3300, marca: 'Ramo', categoriaId: galletasA.id }); });
await paso('contratar promotor (PIN derivado de cédula) y un segundo admin', async () => {
  await crearPersona(dbA, { nombre: 'Nuevo Promotor', rol: 'PROMOTOR', cedula: '1098765432' }, dispA, admin.id);
  await crearPersona(dbA, { nombre: 'Otro Admin', rol: 'ADMIN', cedula: null, pinManual: '123456' }, dispA, admin.id);
});

console.log('\n== D. Drenar la cola contra un Supabase falso ==');
const { drenarColaSync } = await imp('sync/motor.ts');
const fake = crearFake();
globalThis.__db = dbA;
globalThis.__supabase = fake;
await drenarColaSync();
await paso('no queda ninguna tarea pendiente ni con error', async () => {
  const pend = await dbA.getAllAsync('SELECT tabla, tipo_tarea, ultimo_error FROM _sync_pendiente WHERE completado_ts IS NULL');
  assert.equal(pend.length, 0, JSON.stringify(pend));
});
await paso('lo que se subió coincide con el esquema SQL de Supabase (columnas y obligatorias)', async () => {
  const esquema = esquemaSupabase();
  const problemas = [];
  const vistas = new Set();
  for (const { tabla, fila } of fake.capturas) {
    const cols = esquema.get(tabla);
    if (!cols) { problemas.push(`tabla ${tabla} no existe en los .sql`); continue; }
    vistas.add(tabla);
    for (const k of Object.keys(fila)) if (!cols.has(k)) problemas.push(`${tabla}.${k} no existe en Supabase`);
    for (const [c, req] of cols) if (req && !(c in fila)) problemas.push(`${tabla}.${c} es obligatoria y no se envía`);
  }
  console.log('       tablas subidas:', [...vistas].sort().join(', '));
  assert.deepEqual([...new Set(problemas)], []);
});
await paso('el PIN derivado de cédula NO viaja; el de admin sí', async () => {
  const u = [...fake.tablas.get('usuarios').values()];
  const prom = u.find((x) => x.nombre === 'Nuevo Promotor');
  const adm = u.find((x) => x.nombre === 'Otro Admin');
  assert.equal(prom.pin, null);
  assert.equal(adm.pin, '123456');
});
await paso('los usuarios de prueba (seed) no se subieron', async () => {
  assert.ok(![...fake.tablas.get('usuarios').values()].some((x) => ['Cristian', 'Bodega', 'Admin'].includes(x.nombre)));
});

console.log('\n== E. Otro dispositivo (promotor) descarga el catálogo y el personal ==');
const dbB = crearDb();
await aplicar(dbB, migs);
const dispB = 'b0b0b0b0-0000-4000-8000-000000000000';
await sembrarUsuariosDePrueba(dbB, dispB);

const { aplicarDesbloqueoRemoto } = await imp('db/intentosPin.ts');
await paso('aplicar un desbloqueo remoto con admin_id de OTRO dispositivo no falla por FK (el bug real)', async () => {
  // admin.id existe en dbA, NO en dbB — reproduce exactamente lo que pasó en
  // el celular real: Supabase entrega el admin_id del dispositivo que
  // desbloqueó, que nunca sincronizó como "personal" hacia este dispositivo.
  await aplicarDesbloqueoRemoto(dbB, {
    id: 'desbloqueo-remoto-1',
    dispositivoId: dispB,
    modo: 'PROMOTOR',
    adminId: admin.id,
    tsCliente: new Date().toISOString(),
  });
  const fila = await dbB.getFirstAsync(`SELECT admin_id FROM desbloqueos_pin WHERE id='desbloqueo-remoto-1'`);
  assert.equal(fila.admin_id, admin.id);
});
const { descargarDatosDeAdmin, descargarDatosDeAdminConLimite } = await imp('sync/bajada.ts');
const { buscarUsuarioPorPin } = await imp('db/usuarios.ts');
const tl001B = await dbB.getFirstAsync(`SELECT id FROM productos WHERE sku='TL001'`);
const galletasB = await dbB.getFirstAsync(`SELECT id FROM categorias WHERE nombre_normalizado='galletas'`);
await paso('los ids de los productos/categorías iniciales SÍ difieren entre dispositivos (el problema real)', async () => {
  assert.notEqual(tl001B.id, tl001.id);
  assert.notEqual(galletasB.id, galletasA.id);
});
globalThis.__db = dbB;
globalThis.__supabase = fake;
await paso('descargar todo sin errores', async () => { await descargarDatosDeAdmin(dbB); });
await paso('el producto inicial editado se actualiza CONSERVANDO su id local', async () => {
  const f = await dbB.getAllAsync(`SELECT id, precio, marca, categoria_id FROM productos WHERE sku='TL001'`);
  assert.equal(f.length, 1);
  assert.equal(f[0].id, tl001B.id);
  assert.equal(f[0].precio, 3300);
  assert.equal(f[0].marca, 'Ramo');
  assert.equal(f[0].categoria_id, galletasB.id);
});
await paso('el producto nuevo llega con su categoría nueva', async () => {
  const f = await dbB.getFirstAsync(`SELECT p.precio, c.nombre cat FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.nombre='PRODUCTO NUEVO'`);
  assert.equal(f.precio, 4500);
  assert.equal(f.cat, 'Snacks nuevos');
});
await paso('no se duplicaron productos ni categorías', async () => {
  const p = await dbB.getFirstAsync('SELECT count(*) n FROM productos');
  const c = await dbB.getFirstAsync('SELECT count(*) n FROM categorias');
  assert.equal(p.n, 124);
  assert.equal(c.n, 8);
});
await paso('el promotor nuevo puede iniciar sesión con el PIN derivado de su cédula', async () => {
  const u = await buscarUsuarioPorPin(dbB, '5432', ['PROMOTOR']);
  assert.equal(u?.nombre, 'Nuevo Promotor');
});
await paso('el admin nuevo llega con su PIN manual', async () => {
  assert.equal((await buscarUsuarioPorPin(dbB, '123456', ['ADMIN']))?.nombre, 'Otro Admin');
});
await paso('el usuario de prueba local sigue intacto', async () => {
  assert.equal((await buscarUsuarioPorPin(dbB, '8509', ['PROMOTOR']))?.nombre, 'Cristian');
});
await paso('integridad de llaves foráneas', async () => {
  assert.deepEqual(await dbB.getAllAsync('PRAGMA foreign_key_check'), []);
});
await paso('descargar otra vez es idempotente', async () => {
  await descargarDatosDeAdmin(dbB);
  assert.equal((await dbB.getFirstAsync('SELECT count(*) n FROM productos')).n, 124);
});
await paso('una fila con PIN repetido no impide aplicar el resto del personal', async () => {
  fake.tablas.get('usuarios').set('clash', { id: 'clash', nombre: 'Choca', rol: 'PROMOTOR', activo: true, cedula: '99998509', celular: null, direccion: null, pin: '8509', ts_cliente: '2026-01-01T00:00:00Z', dispositivo_id: dispA });
  fake.tablas.get('usuarios').set('ok2', { id: 'ok2', nombre: 'Sigue', rol: 'BODEGA', activo: true, cedula: '7770001111', celular: null, direccion: null, pin: null, ts_cliente: '2026-01-01T00:00:00Z', dispositivo_id: dispA });
  await descargarDatosDeAdmin(dbB);
  assert.equal((await buscarUsuarioPorPin(dbB, '1111', ['BODEGA']))?.nombre, 'Sigue');
});
await paso('producto con categoría desconocida NO borra la categoría local', async () => {
  fake.tablas.get('productos').set('x', { id: 'x', sku: 'TL001', codigo_barras: null, nombre: 'CHOCO', categoria_id: 'no-existe', marca: 'Ramo', es_licor: false, es_perecedero: false, precio: 3400, costo: null, unidad_empaque: 1, activo: true, ts_cliente: '2026-01-01T00:00:00Z', dispositivo_id: dispA });
  fake.tablas.get('productos').delete(tl001.id);
  await descargarDatosDeAdmin(dbB);
  const f = await dbB.getFirstAsync(`SELECT precio, categoria_id FROM productos WHERE sku='TL001'`);
  assert.equal(f.precio, 3400);
  assert.equal(f.categoria_id, galletasB.id);
});
await paso('sin red (cliente que falla): no lanza, no toca nada, y omite productos', async () => {
  const antes = (await dbB.getFirstAsync('SELECT count(*) n FROM productos')).n;
  globalThis.__supabase = { from: () => ({ select: () => ({ returns: async () => { throw new Error('Network request failed'); } }) }) };
  await descargarDatosDeAdmin(dbB);
  assert.equal((await dbB.getFirstAsync('SELECT count(*) n FROM productos')).n, antes);
});
await paso('con límite de tiempo: se rinde a tiempo si la red se cuelga', async () => {
  globalThis.__supabase = { from: () => ({ select: () => ({ returns: () => new Promise(() => {}) }) }) };
  const t0 = Date.now();
  await descargarDatosDeAdminConLimite(dbB, 300);
  assert.ok(Date.now() - t0 < 1500);
});

console.log('\n== F. Personal contratado antes de la sincronización ==');
const { encolarPersonalSinSubir } = await imp('db/personal.ts');
await paso('se encola una sola vez a los no-admin sin tarea, nunca a los admin', async () => {
  const dbC = crearDb();
  await aplicar(dbC, migs);
  const disp = 'c0c0c0c0-0000-4000-8000-000000000000';
  for (const [id, rol, pin] of [['u1', 'PROMOTOR', '1001'], ['u2', 'BODEGA', '1002'], ['u3', 'ADMIN', '222222']])
    await dbC.runAsync(`INSERT INTO usuarios (id,nombre,rol,activo,pin,ts_cliente,dispositivo_id) VALUES (?,?,?,1,?,?,?)`, [id, id, rol, pin, '2026-01-01', disp]);
  await encolarPersonalSinSubir(dbC);
  await encolarPersonalSinSubir(dbC);
  const filas = await dbC.getAllAsync(`SELECT entidad_id FROM _sync_pendiente WHERE tabla='usuarios' ORDER BY entidad_id`);
  assert.deepEqual(filas.map((f) => f.entidad_id), ['u1', 'u2']);
});

console.log('\n== G. Consultas de pantallas (cierre de jornada, meta diaria, mensajes) ==');
{
  const { crearEmpresa } = await imp('db/empresas.ts');
  const { crearPunto } = await imp('db/puntos.ts');
  const { crearEvento, establecerMetaDiaria } = await imp('db/eventos.ts');
  const { obtenerProgresoMetasDiarias } = await imp('db/metasDiarias.ts');
  const { obtenerResumenVentas } = await imp('db/analitica.ts');
  const { existeConteoHoy } = await imp('db/conteos.ts');
  const { obtenerArqueoPorTurno } = await imp('db/arqueos.ts');
  const { obtenerEventoDeHoyPromotor } = await imp('db/turnos.ts');
  const { listarInventarioPromotor } = await imp('db/inventario.ts');
  const { listarMensajesRecibidos, contarMensajesNoLeidos } = await imp('db/mensajes.ts');
  const { fechaHoyBogota } = await imp('core/analitica/index.ts');

  let evento;
  await paso('planear un evento de hoy con meta diaria', async () => {
    const empresa = await crearEmpresa(dbA, { nombre: 'Empresa Prueba' }, dispA);
    const punto = await crearPunto(dbA, { empresaId: empresa.id, nombre: 'Norte' }, dispA);
    evento = await crearEvento(dbA, { empresaId: empresa.id, puntoId: punto.id, fecha: fechaHoyBogota(), promotorIds: [promotor.id], creadoPor: admin.id }, dispA);
    await establecerMetaDiaria(dbA, { eventoId: evento.id, promotorId: promotor.id, montoObjetivo: 1800000 });
  });
  await paso('progreso de la meta diaria del promotor', async () => {
    const p = (await obtenerProgresoMetasDiarias(dbA)).find((x) => x.promotorId === promotor.id);
    assert.ok(p, 'no aparece el promotor');
    assert.equal(p.metaDiaria, 1800000);
    assert.equal(typeof p.totalVendidoHoy, 'number');
    assert.equal(typeof p.progresoPct, 'number');
  });
  await paso('resumen de ventas del turno por método de pago (cierre de jornada)', async () => {
    const r = await obtenerResumenVentas(dbA, { desde: turno.horaInicio, hasta: new Date().toISOString() }, { promotorId: promotor.id });
    const total = (m) => r.porMetodoPago.find((p) => p.metodoPago === m)?.total ?? 0;
    assert.equal(total('TRANSFERENCIA'), 3000);
    assert.equal(total('LIBRANZA'), 3000);
    assert.equal(total('EFECTIVO'), 0); // la única venta en efectivo se anuló
  });
  await paso('conteo de hoy, arqueo y evento de hoy', async () => {
    assert.equal(await existeConteoHoy(dbA, promotor.id), true);
    assert.equal((await obtenerArqueoPorTurno(dbA, turno.id)).diferencia, -500);
    assert.equal((await obtenerEventoDeHoyPromotor(dbA, promotor.id)).id, evento.id);
  });
  await paso('inventario del promotor', async () => {
    assert.ok(Array.isArray(await listarInventarioPromotor(dbA, promotor.id)));
  });
  await paso('mensajes recibidos: listar y contar no leídos', async () => {
    await dbA.runAsync(`INSERT INTO mensajes_recibidos (id, destinatario_id, cuerpo, tipo, remitente_nombre, ts_cliente, leida) VALUES ('m1', ?, 'Ánimo', 'MANUAL', 'Admin', '2026-01-01T00:00:00Z', 0)`, [promotor.id]);
    assert.equal((await listarMensajesRecibidos(dbA, promotor.id)).length, 1);
    assert.equal(await contarMensajesNoLeidos(dbA, promotor.id), 1);
  });
}

console.log('\n== H. Tres dispositivos: admin (computador), bodega y promotor (celulares) ==');
{
  const { crearPersona } = await imp('db/personal.ts');
  const { sincronizarDatosRemotos } = await imp('sync/bajada.ts');
  const { suscribirDatosActualizados } = await imp('sync/eventosDatos.ts');
  const { suscribirCambiosRemotos } = await imp('sync/realtime.ts');
  const { obtenerSaldosBodega, listarInventarioPromotor } = await imp('db/inventario.ts');
  const { listarCarguesPendientes, obtenerCargue, listarCargues } = await imp('db/cargues.ts');
  const { listarVentas } = await imp('db/ventas.ts');

  const nube = crearFake();
  const dbAdmin = crearDb(), dbBodega = crearDb(), dbProm = crearDb();
  for (const d of [dbAdmin, dbBodega, dbProm]) await aplicar(d, migs);
  const dAdm = await getDispositivoId(dbAdmin), dBod = await getDispositivoId(dbBodega), dPro = await getDispositivoId(dbProm);
  const adminId = randomUUID();
  await dbAdmin.runAsync(`INSERT INTO usuarios (id,nombre,rol,activo,pin,ts_cliente,dispositivo_id) VALUES (?, 'Admin Real', 'ADMIN', 1, '654321', ?, ?)`, [adminId, new Date().toISOString(), dAdm]);
  const sesionAdmin = { id: adminId, nombre: 'Admin Real', rol: 'ADMIN' };
  const conNube = (db, fn) => { globalThis.__db = db; globalThis.__supabase = nube; return fn(); };
  const subir = (db) => conNube(db, () => drenarColaSync());
  const sesion = (u) => ({ id: u.id, nombre: u.nombre, rol: u.rol });
  const skuUno = async (db) => db.getFirstAsync(`SELECT id, nombre FROM productos WHERE sku='TL001'`);

  let pedro, beto, ventaP;
  await paso('admin contrata a un promotor y a un bodeguero, y sube el personal', async () => {
    pedro = await crearPersona(dbAdmin, { nombre: 'Pedro Promotor', rol: 'PROMOTOR', cedula: '1234567001' }, dAdm, adminId);
    beto = await crearPersona(dbAdmin, { nombre: 'Beto Bodega', rol: 'BODEGA', cedula: '1234567002' }, dAdm, adminId);
    // Bitácora de auditoría (Julian, migración 0027): registra cada contratación en la misma transacción.
    assert.equal((await dbAdmin.getFirstAsync(`SELECT count(*) n FROM bitacora_auditoria WHERE entidad = 'PERSONA' AND accion = 'CREAR'`)).n, 2);
    await subir(dbAdmin);
  });
  await paso('admin ingresa un pedido a bodega (50 unidades)', async () => {
    await registrarEntradaBodega(dbAdmin, { usuarioId: adminId, items: [{ productoId: (await skuUno(dbAdmin)).id, cantidad: 50 }] }, dAdm);
    await subir(dbAdmin);
  });

  let avisos = 0;
  suscribirDatosActualizados(() => avisos++);

  await paso('el celular de bodega descarga personal, catálogo y el stock de bodega', async () => {
    await conNube(dbBodega, () => sincronizarDatosRemotos(dbBodega, sesion(beto)));
    assert.equal((await obtenerSaldosBodega(dbBodega)).get((await skuUno(dbBodega)).id), 50);
    assert.equal((await buscarUsuarioPorPin(dbBodega, '7002', ['BODEGA']))?.nombre, 'Beto Bodega');
  });
  await paso('admin planea un cargue de 10 unidades para Pedro', async () => {
    await crearCargue(dbAdmin, { promotorId: pedro.id, promotorNombre: pedro.nombre, items: [{ productoId: (await skuUno(dbAdmin)).id, cantidad: 10 }], creadoPor: adminId }, dAdm);
    await subir(dbAdmin);
  });
  await paso('el celular de BODEGA ve el cargue por entregar (problema reportado)', async () => {
    await conNube(dbBodega, () => sincronizarDatosRemotos(dbBodega, sesion(beto)));
    const lista = await listarCarguesPendientes(dbBodega);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].promotorNombre, 'Pedro Promotor');
    const det = await obtenerCargue(dbBodega, lista[0].id);
    assert.equal(det.lineas.length, 1);
    assert.equal(det.lineas[0].cantidadPlaneada, 10);
    assert.equal(det.lineas[0].productoNombre, (await skuUno(dbBodega)).nombre);
  });
  await paso('Pedro descarga el personal e inicia turno en su celular', async () => {
    await conNube(dbProm, () => sincronizarDatosRemotos(dbProm, sesion(pedro)));
    await iniciarTurno(dbProm, { promotorId: pedro.id, selfieUri: 'file:///s.jpg', latitud: 1, longitud: 1 }, dPro);
    await subir(dbProm);
  });
  await paso('bodega entrega el cargue (verifica el turno en Supabase, no en su base local)', async () => {
    const [pendiente] = await listarCarguesPendientes(dbBodega);
    const det = await obtenerCargue(dbBodega, pendiente.id);
    await conNube(dbBodega, () => confirmarLineaCargue(dbBodega, { lineaId: det.lineas[0].id, cantidadEntregada: 10, ejecutorId: beto.id }, dBod));
    await subir(dbBodega);
  });
  await paso('el inventario de Pedro, en SU celular, muestra lo que bodega le entregó', async () => {
    await conNube(dbProm, () => sincronizarDatosRemotos(dbProm, sesion(pedro)));
    const inv = await listarInventarioPromotor(dbProm, pedro.id);
    assert.equal(inv.length, 1);
    assert.equal(inv[0].producto.sku, 'TL001');
    assert.equal(inv[0].saldo, 10);
  });
  await paso('Pedro vende 2 unidades desde su celular', async () => {
    const p = await skuUno(dbProm);
    ventaP = await registrarVenta(dbProm, { promotorId: pedro.id, promotorNombre: pedro.nombre, items: [{ productoId: p.id, productoNombre: p.nombre, cantidad: 2, precioUnitario: 3300 }], metodoPago: 'EFECTIVO' }, dPro);
    await subir(dbProm);
  });
  await paso('el ADMIN ve la venta del celular sin tocar nada, y las pantallas reciben aviso (problema reportado)', async () => {
    const antes = avisos;
    await conNube(dbAdmin, () => sincronizarDatosRemotos(dbAdmin, sesionAdmin));
    const ventas = await listarVentas(dbAdmin, { incluirAnuladas: false });
    assert.equal(ventas.length, 1);
    assert.equal(ventas[0].total, 6600);
    assert.equal(ventas[0].promotorNombre, 'Pedro Promotor');
    assert.ok(avisos > antes, 'las pantallas abiertas no recibieron aviso de refresco');
    const item = await dbAdmin.getFirstAsync('SELECT vi.cantidad, p.sku FROM venta_items vi JOIN productos p ON p.id = vi.producto_id');
    assert.deepEqual([item.sku, item.cantidad], ['TL001', 2]);
  });
  await paso('el admin ve el cargue ENTREGADO por bodega y su stock de bodega bajó a 40', async () => {
    const [c] = await listarCargues(dbAdmin);
    const det = await obtenerCargue(dbAdmin, c.id);
    assert.equal(c.estado, 'ENTREGADO');
    assert.deepEqual([det.lineas[0].estado, det.lineas[0].cantidadEntregada], ['ENTREGADA', 10]);
    assert.equal((await obtenerSaldosBodega(dbAdmin)).get((await skuUno(dbAdmin)).id), 40);
  });
  await paso('el admin anula la venta y el inventario de Pedro se restituye en su celular', async () => {
    const [v] = await listarVentas(dbAdmin, { incluirAnuladas: false });
    await anularVenta(dbAdmin, { ventaId: v.id, adminId, motivo: 'error de digitación' }, dAdm);
    await subir(dbAdmin);
    await conNube(dbProm, () => sincronizarDatosRemotos(dbProm, sesion(pedro)));
    assert.equal((await listarInventarioPromotor(dbProm, pedro.id))[0].saldo, 10); // 10 - 2 vendidos + 2 anulados
  });
  await paso('sincronizar de nuevo es idempotente: sin duplicados y sin avisos de más', async () => {
    const antes = avisos;
    for (let i = 0; i < 2; i++) await conNube(dbAdmin, () => sincronizarDatosRemotos(dbAdmin, sesionAdmin));
    assert.equal((await dbAdmin.getFirstAsync('SELECT count(*) n FROM ventas')).n, 1);
    assert.equal((await dbAdmin.getFirstAsync(`SELECT count(*) n FROM usuarios WHERE nombre = 'Pedro Promotor'`)).n, 1);
    assert.equal(avisos, antes);
  });
  await paso('venta de un promotor con otro id (usuario de prueba): se atribuye por nombre, o queda como fantasma inactivo', async () => {
    const base = { punto_id: null, punto_nombre: null, ts_cliente: new Date().toISOString(), metodo_pago: 'EFECTIVO', total: 3300, anulada: false, motivo_anulacion: null, dispositivo_id: dPro };
    const item = (id) => ({ venta_id: id, producto_id: randomUUID(), producto_sku: 'TL001', producto_nombre: 'X', cantidad: 1, precio_unitario: 3300, ts_cliente: new Date().toISOString(), dispositivo_id: dPro });
    const v1 = randomUUID(), v2 = randomUUID();
    await nube.from('ventas').upsert({ ...base, id: v1, numero_recibo: 'Z-1', promotor_id: randomUUID(), promotor_nombre: 'Pedro Promotor' });
    await nube.from('venta_items').upsert(item(v1));
    await nube.from('ventas').upsert({ ...base, id: v2, numero_recibo: 'Z-2', promotor_id: randomUUID(), promotor_nombre: 'Fulano Nuevo' });
    await nube.from('venta_items').upsert(item(v2));
    await conNube(dbAdmin, () => sincronizarDatosRemotos(dbAdmin, sesionAdmin));
    assert.equal((await dbAdmin.getFirstAsync('SELECT count(*) n FROM ventas')).n, 3);
    assert.equal((await dbAdmin.getFirstAsync(`SELECT count(*) n FROM usuarios WHERE nombre = 'Pedro Promotor'`)).n, 1);
    const f = await dbAdmin.getFirstAsync(`SELECT activo, pin FROM usuarios WHERE nombre = 'Fulano Nuevo'`);
    assert.deepEqual([f.activo, f.pin], [0, null]);
  });
  await paso('venta subida ANTES de enviar el sku (sin producto_sku): se resuelve por nombre de producto', async () => {
    const nombre = (await skuUno(dbAdmin)).nombre;
    const id = randomUUID();
    const antes = (await dbAdmin.getFirstAsync('SELECT count(*) n FROM ventas')).n;
    await nube.from('ventas').upsert({ id, numero_recibo: 'OLD-1', promotor_id: pedro.id, promotor_nombre: 'Pedro Promotor', punto_id: null, punto_nombre: null, ts_cliente: new Date().toISOString(), metodo_pago: 'EFECTIVO', total: 3000, anulada: false, motivo_anulacion: null, dispositivo_id: dPro });
    await nube.from('venta_items').upsert({ venta_id: id, producto_id: randomUUID(), producto_nombre: nombre, cantidad: 1, precio_unitario: 3000, ts_cliente: new Date().toISOString(), dispositivo_id: dPro });
    await conNube(dbAdmin, () => sincronizarDatosRemotos(dbAdmin, sesionAdmin));
    assert.equal((await dbAdmin.getFirstAsync('SELECT count(*) n FROM ventas')).n, antes + 1);
    assert.equal((await dbAdmin.getFirstAsync('SELECT count(*) n FROM venta_items WHERE venta_id = ?', [id])).n, 1);
  });
  await paso('una línea ENTREGADA no retrocede aunque otro dispositivo suba su copia vieja (trigger de Supabase)', async () => {
    const lineaRemota = [...nube.tablas.get('cargue_lineas').values()][0];
    await nube.from('cargue_lineas').upsert({ ...lineaRemota, estado: 'PENDIENTE', cantidad_entregada: 0 });
    assert.equal([...nube.tablas.get('cargue_lineas').values()][0].estado, 'ENTREGADA');
  });
  await paso('Realtime: se suscribe a las tablas pedidas y avisa cuando cambian; cancelar libera el canal', async () => {
    globalThis.__supabase = nube;
    let recibidos = 0;
    const base = nube.canales.length;
    const cancelar = suscribirCambiosRemotos(['ventas', 'cargues'], () => recibidos++);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(nube.canales.length, base + 1);
    await nube.from('ventas').upsert({ id: randomUUID(), numero_recibo: 'R-1' });
    await nube.from('movimientos').upsert({ id: randomUUID() }); // tabla no pedida: no debe avisar
    assert.equal(recibidos, 1);
    cancelar();
    assert.equal(nube.canales.length, base);
  });
}

console.log('\n== I. Traslado entre promotores (sin pasar por bodega) ==');
{
  const dbI = crearDb();
  await aplicar(dbI, migs);
  const dispI = await getDispositivoId(dbI);
  await sembrarUsuariosDePrueba(dbI, dispI);
  const promotorOrigen = await dbI.getFirstAsync(`SELECT id, nombre FROM usuarios WHERE pin='8509'`);
  const bodegaI = await dbI.getFirstAsync(`SELECT id FROM usuarios WHERE pin='1234'`);
  const adminI = await dbI.getFirstAsync(`SELECT id FROM usuarios WHERE pin='000000'`);
  const tl001I = await dbI.getFirstAsync(`SELECT id, nombre FROM productos WHERE sku='TL001'`);

  const promotorDestino = { id: crypto.randomUUID(), nombre: 'Promotor Destino' };
  await dbI.runAsync(
    `INSERT INTO usuarios (id, nombre, rol, activo, ts_cliente, dispositivo_id) VALUES (?, ?, 'PROMOTOR', 1, ?, ?)`,
    [promotorDestino.id, promotorDestino.nombre, new Date().toISOString(), dispI]
  );

  const { registrarEntradaBodega: registrarEntradaBodegaI } = await imp('db/entradasBodega.ts');
  const { crearCargue: crearCargueI, confirmarLineaCargue: confirmarLineaCargueI } = await imp('db/cargues.ts');
  const { iniciarTurno: iniciarTurnoI } = await imp('db/turnos.ts');
  const { crearTraslado, confirmarLineaTraslado, resolverLineaEnRevisionTraslado } = await imp('db/traslados.ts');
  const { obtenerSaldosPromotor: obtenerSaldosPromotorI } = await imp('db/inventario.ts');

  await paso('preparar inventario del promotor origen (RECARGA real vía cargue)', async () => {
    await iniciarTurnoI(dbI, { promotorId: promotorOrigen.id, selfieUri: 'file:///s.jpg', latitud: 1, longitud: 1 }, dispI);
    await registrarEntradaBodegaI(dbI, { usuarioId: bodegaI.id, items: [{ productoId: tl001I.id, cantidad: 50 }] }, dispI);
    await crearCargueI(dbI, { promotorId: promotorOrigen.id, promotorNombre: promotorOrigen.nombre, items: [{ productoId: tl001I.id, cantidad: 10 }], creadoPor: adminI.id }, dispI);
    const linea = await dbI.getFirstAsync('SELECT id FROM cargue_lineas LIMIT 1');
    await confirmarLineaCargueI(dbI, { lineaId: linea.id, cantidadEntregada: 10, ejecutorId: bodegaI.id }, dispI);
  });

  await paso('traslado entre promotores: baja el saldo del origen, sube el del destino, sin exigir turno del destino', async () => {
    await crearTraslado(dbI, { promotorOrigenId: promotorOrigen.id, promotorOrigenNombre: promotorOrigen.nombre, promotorDestinoId: promotorDestino.id, promotorDestinoNombre: promotorDestino.nombre, items: [{ productoId: tl001I.id, cantidad: 4 }], creadoPor: adminI.id }, dispI);
    const lineaTraslado = await dbI.getFirstAsync('SELECT id FROM traslado_lineas LIMIT 1');
    // El promotor DESTINO nunca inició turno — a diferencia de un cargue
    // normal, esto NO debe bloquear la confirmación (confirmado con el
    // usuario: el traslado es una operación administrativa, como RETIRO_ADMIN).
    await confirmarLineaTraslado(dbI, { lineaId: lineaTraslado.id, cantidadEntregada: 4, ejecutorId: bodegaI.id }, dispI);

    const saldosOrigen = await obtenerSaldosPromotorI(dbI, promotorOrigen.id);
    const saldosDestino = await obtenerSaldosPromotorI(dbI, promotorDestino.id);
    assert.equal(saldosOrigen.get(tl001I.id), 6, `el origen debería quedar con 6, quedó con ${saldosOrigen.get(tl001I.id)}`);
    assert.equal(saldosDestino.get(tl001I.id), 4, `el destino debería quedar con 4, quedó con ${saldosDestino.get(tl001I.id)}`);
  });

  await paso('traslado parcial queda REVISAR con motivo, y se resuelve después', async () => {
    await crearTraslado(dbI, { promotorOrigenId: promotorOrigen.id, promotorOrigenNombre: promotorOrigen.nombre, promotorDestinoId: promotorDestino.id, promotorDestinoNombre: promotorDestino.nombre, items: [{ productoId: tl001I.id, cantidad: 2 }], creadoPor: adminI.id }, dispI);
    const lineaParcial = await dbI.getFirstAsync(`SELECT id FROM traslado_lineas WHERE cantidad_planeada = 2`);
    await confirmarLineaTraslado(dbI, { lineaId: lineaParcial.id, cantidadEntregada: 1, motivoRevision: 'Faltó una unidad', ejecutorId: bodegaI.id }, dispI);
    let fila = await dbI.getFirstAsync('SELECT estado, motivo_revision FROM traslado_lineas WHERE id = ?', [lineaParcial.id]);
    assert.equal(fila.estado, 'REVISAR');
    assert.equal(fila.motivo_revision, 'Faltó una unidad');

    await resolverLineaEnRevisionTraslado(dbI, { lineaId: lineaParcial.id, cantidadAdicional: 1, ejecutorId: adminI.id }, dispI);
    fila = await dbI.getFirstAsync('SELECT estado, cantidad_entregada FROM traslado_lineas WHERE id = ?', [lineaParcial.id]);
    assert.equal(fila.estado, 'ENTREGADA');
    assert.equal(fila.cantidad_entregada, 2);
  });

  await paso('no se puede trasladar más de lo que tiene el promotor origen (StockInsuficienteError)', async () => {
    let lanzo = false;
    try {
      await crearTraslado(dbI, { promotorOrigenId: promotorOrigen.id, promotorOrigenNombre: promotorOrigen.nombre, promotorDestinoId: promotorDestino.id, promotorDestinoNombre: promotorDestino.nombre, items: [{ productoId: tl001I.id, cantidad: 999 }], creadoPor: adminI.id }, dispI);
    } catch (e) {
      lanzo = e.name === 'StockInsuficienteError';
    }
    assert.ok(lanzo, 'debería lanzar StockInsuficienteError');
  });

  await paso('un traslado a sí mismo se rechaza', async () => {
    let lanzo = false;
    try {
      await crearTraslado(dbI, { promotorOrigenId: promotorOrigen.id, promotorOrigenNombre: promotorOrigen.nombre, promotorDestinoId: promotorOrigen.id, promotorDestinoNombre: promotorOrigen.nombre, items: [{ productoId: tl001I.id, cantidad: 1 }], creadoPor: adminI.id }, dispI);
    } catch {
      lanzo = true;
    }
    assert.ok(lanzo, 'debería rechazar origen === destino');
  });

  await paso('traslados sincroniza: encolar + drenar contra Supabase falso coincide con el esquema SQL', async () => {
    const { drenarColaSync: drenarColaSyncI } = await imp('sync/motor.ts');
    const fakeI = crearFake();
    globalThis.__db = dbI;
    globalThis.__supabase = fakeI;
    await drenarColaSyncI();
    const pendientesI = await dbI.getAllAsync("SELECT tabla FROM _sync_pendiente WHERE completado_ts IS NULL AND tabla = 'traslados'");
    assert.equal(pendientesI.length, 0, 'quedaron traslados sin subir');

    const esquema = esquemaSupabase();
    const cols = esquema.get('traslados');
    const colsLineas = esquema.get('traslado_lineas');
    assert.ok(cols, 'falta la tabla traslados en supabase/migraciones/*.sql');
    assert.ok(colsLineas, 'falta la tabla traslado_lineas en supabase/migraciones/*.sql');
    for (const { tabla, fila } of fakeI.capturas) {
      if (tabla !== 'traslados' && tabla !== 'traslado_lineas') continue;
      const columnas = tabla === 'traslados' ? cols : colsLineas;
      for (const k of Object.keys(fila)) assert.ok(columnas.has(k), `${tabla}.${k} no existe en Supabase`);
    }
  });
}

console.log('\n== J. Empresas y puntos: admin los crea, el celular del promotor los recibe ==');
{
  const { crearEmpresa, listarEmpresas } = await imp('db/empresas.ts');
  const { crearPunto, listarPuntos, encolarEmpresasYPuntosSinSubir } = await imp('db/puntos.ts');
  const { sincronizarDatosRemotos } = await imp('sync/bajada.ts');

  const nube = crearFake();
  const dbAdm = crearDb(), dbPro = crearDb();
  for (const d of [dbAdm, dbPro]) await aplicar(d, migs);
  const dAdm = await getDispositivoId(dbAdm);
  const conNube = (db, fn) => { globalThis.__db = db; globalThis.__supabase = nube; return fn(); };
  const sesionPromotor = { id: randomUUID(), nombre: 'Pedro', rol: 'PROMOTOR' };
  const tareas = async (tabla) => (await dbAdm.getFirstAsync(`SELECT count(*) n FROM _sync_pendiente WHERE tabla = ?`, [tabla])).n;

  let falabella, norte, sur;
  await paso('admin crea una empresa y dos puntos: cada uno se encola en la misma transacción', async () => {
    falabella = await crearEmpresa(dbAdm, { nombre: 'Falabella', direccion: 'Cra 7' }, dAdm);
    norte = await crearPunto(dbAdm, { empresaId: falabella.id, nombre: 'Norte' }, dAdm);
    sur = await crearPunto(dbAdm, { empresaId: falabella.id, nombre: 'Sur' }, dAdm);
    assert.equal(await tareas('empresas'), 1);
    assert.equal(await tareas('puntos'), 2);
  });
  await paso('el seed de demo (sincronizar: false) NO encola nada', async () => {
    const demo = await crearEmpresa(dbAdm, { nombre: 'Empresa Demo' }, dAdm, { sincronizar: false });
    await crearPunto(dbAdm, { empresaId: demo.id, nombre: 'Demo' }, dAdm, { sincronizar: false });
    assert.equal(await tareas('empresas'), 1);
    assert.equal(await tareas('puntos'), 2);
  });
  let exito;
  await paso('empresa creada ANTES de sincronizar: el respaldo la encola una sola vez, y subir su punto la sube también', async () => {
    exito = randomUUID();
    await dbAdm.runAsync(`INSERT INTO empresas (id, nombre, ts_cliente, dispositivo_id) VALUES (?, 'Éxito', ?, ?)`, [exito, new Date().toISOString(), dAdm]);
    await dbAdm.runAsync(`INSERT INTO puntos (id, empresa_id, nombre, activo, ts_cliente, dispositivo_id) VALUES (?, ?, 'Centro', 1, ?, ?)`, [randomUUID(), exito, new Date().toISOString(), dAdm]);
    await encolarEmpresasYPuntosSinSubir(dbAdm);
    await encolarEmpresasYPuntosSinSubir(dbAdm);
    // Incluye las de demo: el respaldo solo corre fuera de __DEV__ (app/index.tsx), donde no hay seed.
    assert.equal(await tareas('empresas'), 3);
    assert.equal(await tareas('puntos'), 4);
  });
  await paso('subir: sin tareas pendientes y lo subido coincide con las columnas de 0012', async () => {
    await conNube(dbAdm, () => drenarColaSync());
    const pend = await dbAdm.getAllAsync('SELECT tabla, ultimo_error FROM _sync_pendiente WHERE completado_ts IS NULL');
    assert.deepEqual(pend, []);
    const esquema = esquemaSupabase();
    const problemas = [];
    for (const { tabla, fila } of nube.capturas.filter((c) => ['empresas', 'puntos'].includes(c.tabla))) {
      const cols = esquema.get(tabla);
      if (!cols) { problemas.push(`falta la tabla ${tabla} en supabase/migraciones`); continue; }
      for (const k of Object.keys(fila)) if (!cols.has(k)) problemas.push(`${tabla}.${k} no existe en Supabase`);
      for (const [c, req] of cols) if (req && !(c in fila)) problemas.push(`${tabla}.${c} es obligatoria y no se envía`);
    }
    assert.deepEqual([...new Set(problemas)], []);
    assert.equal(nube.tablas.get('empresas').size, 3);
    assert.equal(nube.tablas.get('puntos').size, 4);
  });
  await paso('el celular del promotor descarga empresas y puntos con el MISMO id del admin', async () => {
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, sesionPromotor));
    const puntos = await listarPuntos(dbPro, { empresaId: falabella.id });
    assert.deepEqual(puntos.map((p) => p.nombre).sort(), ['Norte', 'Sur']);
    assert.ok((await listarEmpresas(dbPro)).some((e) => e.id === exito && e.nombre === 'Éxito'));
    assert.deepEqual(await dbPro.getAllAsync('PRAGMA foreign_key_check'), []);
  });
  await paso('un punto desactivado en el admin deja de aparecer en el celular', async () => {
    await dbAdm.runAsync('UPDATE puntos SET activo = 0 WHERE id = ?', [sur.id]);
    await dbAdm.runAsync(`INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, 'puntos', ?, 'FILA', ?)`, [randomUUID(), sur.id, new Date().toISOString()]);
    await conNube(dbAdm, () => drenarColaSync());
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, sesionPromotor));
    assert.deepEqual((await listarPuntos(dbPro, { empresaId: falabella.id })).map((p) => p.nombre), ['Norte']);
  });
  await paso('descargar otra vez es idempotente (sin duplicados)', async () => {
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, sesionPromotor));
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM empresas')).n, 3);
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM puntos')).n, 4);
  });
  await paso('un punto cuya empresa no llegó se omite sin frenar a los demás', async () => {
    const huerfano = randomUUID(), nuevo = randomUUID();
    await nube.from('puntos').upsert({ id: huerfano, empresa_id: randomUUID(), nombre: 'Huérfano', direccion: null, activo: true, ts_cliente: new Date().toISOString(), dispositivo_id: dAdm });
    await nube.from('puntos').upsert({ id: nuevo, empresa_id: falabella.id, nombre: 'Occidente', direccion: null, activo: true, ts_cliente: new Date().toISOString(), dispositivo_id: dAdm });
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, sesionPromotor));
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM puntos WHERE id = ?', [huerfano])).n, 0);
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM puntos WHERE id = ?', [nuevo])).n, 1);
  });
  await paso('sin red: no lanza, no toca empresas/puntos locales', async () => {
    const antes = (await dbPro.getFirstAsync('SELECT count(*) n FROM puntos')).n;
    globalThis.__db = dbPro;
    globalThis.__supabase = { from: () => ({ select: () => ({ returns: async () => { throw new Error('Network request failed'); } }) }) };
    await sincronizarDatosRemotos(dbPro, sesionPromotor);
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM puntos')).n, antes);
  });
}

console.log('\n== K. Eventos del calendario: admin los planea, el celular del promotor los recibe ==');
{
  const { crearEmpresa } = await imp('db/empresas.ts');
  const { crearPunto } = await imp('db/puntos.ts');
  const {
    crearEvento, crearSerieRecurrente, reasignarEvento, cancelarEvento, establecerMetaDiaria,
    listarEventosPromotor, obtenerPuntoVigentePromotor, encolarEventosSinSubir, descargarEventosNuevos,
  } = await imp('db/eventos.ts');
  const { crearPersona } = await imp('db/personal.ts');
  const { sincronizarDatosRemotos } = await imp('sync/bajada.ts');
  const { suscribirDatosActualizados } = await imp('sync/eventosDatos.ts');
  const { suscribirCambiosRemotos } = await imp('sync/realtime.ts');
  const { fechaHoyBogota } = await imp('core/analitica/index.ts');

  const nube = crearFake();
  const dbAdm = crearDb(), dbPro = crearDb();
  for (const d of [dbAdm, dbPro]) await aplicar(d, migs);
  const dAdm = await getDispositivoId(dbAdm);
  const dPro = 'c0c0c0c0-0000-4000-8000-000000000000';
  // Los dos arrancan como en `__DEV__`: cada uno con SUS usuarios de prueba (ids distintos).
  await sembrarUsuariosDePrueba(dbAdm, dAdm);
  await sembrarUsuariosDePrueba(dbPro, dPro);
  const adminK = await dbAdm.getFirstAsync(`SELECT id FROM usuarios WHERE pin='000000'`);
  const cristianAdm = await dbAdm.getFirstAsync(`SELECT id FROM usuarios WHERE pin='8509'`);
  const cristianPro = await dbPro.getFirstAsync(`SELECT id, nombre FROM usuarios WHERE pin='8509'`);
  const conNube = (db, fn) => { globalThis.__db = db; globalThis.__supabase = nube; return fn(); };
  const tareas = async (tabla) => (await dbAdm.getFirstAsync(`SELECT count(*) n FROM _sync_pendiente WHERE tabla = ?`, [tabla])).n;
  const hoy = fechaHoyBogota();
  const manana = fechaHoyBogota(new Date(Date.now() + 24 * 3600 * 1000));
  const rango = { desde: hoy, hasta: manana };

  let laura, falabella, norte, evento, eventoManana;
  await paso('admin contrata a Laura y planea el evento de hoy (Laura + su Cristian): se encola en la misma transacción', async () => {
    laura = await crearPersona(dbAdm, { nombre: 'Laura Gómez', rol: 'PROMOTOR', cedula: '52123456' }, dAdm, adminK.id);
    falabella = await crearEmpresa(dbAdm, { nombre: 'Falabella' }, dAdm);
    norte = await crearPunto(dbAdm, { empresaId: falabella.id, nombre: 'Norte' }, dAdm);
    evento = await crearEvento(dbAdm, { empresaId: falabella.id, puntoId: norte.id, fecha: hoy, promotorIds: [laura.id, cristianAdm.id], creadoPor: adminK.id }, dAdm);
    eventoManana = await crearEvento(dbAdm, { empresaId: falabella.id, puntoId: norte.id, fecha: manana, promotorIds: [laura.id], creadoPor: adminK.id }, dAdm);
    assert.equal(await tareas('eventos'), 2);
  });
  await paso('fijar la meta diaria encola el evento otra vez', async () => {
    await establecerMetaDiaria(dbAdm, { eventoId: evento.id, promotorId: laura.id, montoObjetivo: 1800000 });
    assert.equal(await tareas('eventos'), 3);
  });
  let eventoDemo;
  await paso('el seed de demo (sincronizar: false) NO encola, pero el respaldo lo encola una sola vez', async () => {
    const demo = await crearEmpresa(dbAdm, { nombre: 'Demo SA' }, dAdm, { sincronizar: false });
    const puntoDemo = await crearPunto(dbAdm, { empresaId: demo.id, nombre: 'Demo' }, dAdm, { sincronizar: false });
    eventoDemo = await crearEvento(dbAdm, { empresaId: demo.id, puntoId: puntoDemo.id, fecha: hoy, promotorIds: [laura.id], creadoPor: adminK.id }, dAdm, { sincronizar: false });
    assert.equal(await tareas('eventos'), 3);
    await encolarEventosSinSubir(dbAdm);
    await encolarEventosSinSubir(dbAdm);
    assert.equal(await tareas('eventos'), 4);
  });
  await paso('subir: sin pendientes, columnas de 0014 y promotores con su meta; el punto que nunca subió sube con su evento', async () => {
    await conNube(dbAdm, () => drenarColaSync());
    const pend = await dbAdm.getAllAsync('SELECT tabla, ultimo_error FROM _sync_pendiente WHERE completado_ts IS NULL');
    assert.deepEqual(pend, []);
    const esquema = esquemaSupabase();
    const cols = esquema.get('eventos');
    assert.ok(cols, 'falta la tabla eventos en supabase/migraciones');
    const problemas = [];
    for (const { fila } of nube.capturas.filter((c) => c.tabla === 'eventos')) {
      for (const k of Object.keys(fila)) if (!cols.has(k)) problemas.push(`eventos.${k} no existe en Supabase`);
      for (const [c, req] of cols) if (req && !(c in fila)) problemas.push(`eventos.${c} es obligatoria y no se envía`);
    }
    assert.deepEqual([...new Set(problemas)], []);
    const remoto = nube.tablas.get('eventos').get(evento.id);
    const meta = Object.fromEntries(remoto.promotores.map((p) => [p.promotor_nombre, p.meta_diaria]));
    assert.deepEqual(meta, { 'Laura Gómez': 1800000, Cristian: null });
    assert.equal(remoto.creado_por_nombre, 'Admin');
    const demoRemoto = nube.tablas.get('eventos').get(eventoDemo.id);
    assert.ok(nube.tablas.get('puntos').has(demoRemoto.punto_id), 'el punto de demo no subió con su evento');
    assert.ok(nube.tablas.get('empresas').has(demoRemoto.empresa_id), 'la empresa de demo no subió con su evento');
  });
  let avisos = 0;
  const dejarDeOir = suscribirDatosActualizados(() => { avisos++; });
  await paso('el celular de Laura recibe su calendario, su punto vigente y su meta del día', async () => {
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, { id: laura.id, nombre: laura.nombre, rol: 'PROMOTOR' }));
    const propios = await listarEventosPromotor(dbPro, laura.id, rango);
    assert.deepEqual(propios.map((e) => e.fecha).sort(), [hoy, hoy, manana].sort());
    const deHoy = propios.find((e) => e.id === evento.id);
    assert.equal(deHoy.puntoNombre, 'Norte');
    assert.equal(deHoy.metaDiariaPorPromotor[laura.id], 1800000);
    assert.ok(avisos > 0, 'no avisó a las pantallas abiertas');
    const vigente = await obtenerPuntoVigentePromotor(dbPro, laura.id);
    assert.ok([evento.id, eventoDemo.id].includes(vigente?.id), 'sin punto vigente: la venta quedaría sin punto');
    assert.deepEqual(await dbPro.getAllAsync('PRAGMA foreign_key_check'), []);
  });
  await paso('"Cristian" de prueba (id distinto en cada dispositivo) se traduce por nombre al Cristian local', async () => {
    const suyos = await listarEventosPromotor(dbPro, cristianPro.id, rango);
    assert.deepEqual(suyos.map((e) => e.id), [evento.id]);
  });
  await paso('descargar otra vez no cambia nada ni vuelve a avisar', async () => {
    const antes = avisos;
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, { id: laura.id, nombre: laura.nombre, rol: 'PROMOTOR' }));
    assert.equal(avisos, antes);
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM eventos')).n, 3);
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM evento_promotores WHERE evento_id = ?', [evento.id])).n, 2);
  });
  await paso('admin quita a Cristian y cancela el de mañana: el celular lo refleja (y avisa)', async () => {
    await reasignarEvento(dbAdm, { eventoId: evento.id, promotorIds: [laura.id] });
    await cancelarEvento(dbAdm, { eventoId: eventoManana.id, motivo: 'La empresa cerró' }, dAdm, adminK.id);
    await conNube(dbAdm, () => drenarColaSync());
    const antes = avisos;
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, { id: laura.id, nombre: laura.nombre, rol: 'PROMOTOR' }));
    assert.ok(avisos > antes);
    assert.deepEqual((await listarEventosPromotor(dbPro, cristianPro.id, rango)).map((e) => e.id), []);
    const cancelado = (await listarEventosPromotor(dbPro, laura.id, rango)).find((e) => e.id === eventoManana.id);
    assert.deepEqual([cancelado.estado, cancelado.motivoCancelacion], ['CANCELADO', 'La empresa cerró']);
  });
  dejarDeOir();
  await paso('una serie recurrente sube todas sus ocurrencias (la serie no viaja: bajan sin serie_id)', async () => {
    const serie = await crearSerieRecurrente(dbAdm, { empresaId: falabella.id, puntoId: norte.id, promotorIds: [laura.id], frecuencia: 'DIAS', intervalo: 1, fechaDesde: manana, fechaHasta: fechaHoyBogota(new Date(Date.now() + 3 * 24 * 3600 * 1000)), creadoPor: adminK.id }, dAdm);
    await conNube(dbAdm, () => drenarColaSync());
    await conNube(dbPro, () => sincronizarDatosRemotos(dbPro, { id: laura.id, nombre: laura.nombre, rol: 'PROMOTOR' }));
    const ids = serie.map((e) => e.id);
    const locales = await dbPro.getAllAsync(`SELECT serie_id FROM eventos WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    assert.equal(locales.length, ids.length);
    assert.ok(locales.every((f) => f.serie_id === null));
  });
  await paso('una edición propia aún sin subir no se pisa con la copia remota (admin y promotor en la misma base)', async () => {
    await dbPro.runAsync(`UPDATE eventos SET estado = 'EN_CURSO' WHERE id = ?`, [evento.id]);
    await dbPro.runAsync(`INSERT INTO _sync_pendiente (id, tabla, entidad_id, tipo_tarea, creado_ts) VALUES (?, 'eventos', ?, 'FILA', ?)`, [randomUUID(), evento.id, new Date().toISOString()]);
    await nube.from('eventos').upsert({ ...nube.tablas.get('eventos').get(evento.id) });
    await conNube(dbPro, () => descargarEventosNuevos(dbPro));
    assert.equal((await dbPro.getFirstAsync('SELECT estado FROM eventos WHERE id = ?', [evento.id])).estado, 'EN_CURSO');
    await dbPro.runAsync(`DELETE FROM _sync_pendiente WHERE entidad_id = ?`, [evento.id]);
  });
  await paso('un evento cuyo punto llegó después de la descarga de puntos se aplica igual (vuelve a pedir los puntos)', async () => {
    const e2 = randomUUID(), p2 = randomUUID(), ev2 = randomUUID();
    const ahoraIso = new Date().toISOString();
    await nube.from('empresas').upsert({ id: e2, nombre: 'Éxito', direccion: null, sector: null, contacto: null, ts_cliente: ahoraIso, dispositivo_id: dAdm });
    await nube.from('puntos').upsert({ id: p2, empresa_id: e2, nombre: 'Centro', direccion: null, activo: true, ts_cliente: ahoraIso, dispositivo_id: dAdm });
    await nube.from('eventos').upsert({ id: ev2, empresa_id: e2, punto_id: p2, fecha: manana, estado: 'PLANEADO', motivo_cancelacion: null, serie_id: null, creado_por: adminK.id, creado_por_nombre: 'Admin', promotores: [{ promotor_id: laura.id, promotor_nombre: laura.nombre, meta_diaria: 900000 }], ts_cliente: ahoraIso, dispositivo_id: dAdm });
    const cambios = await conNube(dbPro, () => descargarEventosNuevos(dbPro));
    assert.ok(cambios >= 1);
    const f = await dbPro.getFirstAsync(`SELECT p.nombre FROM eventos ev JOIN puntos p ON p.id = ev.punto_id WHERE ev.id = ?`, [ev2]);
    assert.equal(f?.nombre, 'Centro');
  });
  await paso('Realtime avisa al celular cuando admin sube un evento', async () => {
    let avisado = 0;
    globalThis.__supabase = nube;
    const cancelar = suscribirCambiosRemotos(['movimientos', 'eventos'], () => { avisado++; });
    await new Promise((r) => setTimeout(r, 0));
    await establecerMetaDiaria(dbAdm, { eventoId: evento.id, promotorId: laura.id, montoObjetivo: 2500000 });
    await conNube(dbAdm, () => drenarColaSync());
    cancelar();
    assert.ok(avisado > 0);
  });
  await paso('sin red: no lanza y no toca los eventos locales', async () => {
    const antes = (await dbPro.getFirstAsync('SELECT count(*) n FROM eventos')).n;
    globalThis.__db = dbPro;
    globalThis.__supabase = { from: () => ({ select: () => ({ returns: async () => { throw new Error('Network request failed'); } }) }) };
    assert.equal(await descargarEventosNuevos(dbPro), 0);
    await sincronizarDatosRemotos(dbPro, { id: laura.id, nombre: laura.nombre, rol: 'PROMOTOR' });
    assert.equal((await dbPro.getFirstAsync('SELECT count(*) n FROM eventos')).n, antes);
  });
}

console.log('\n== L. Mensajes: el admin solo guarda el mensaje; el push lo envía Supabase ==');
{
  const { enviarMensajes } = await imp('db/mensajes.ts');
  const nube = crearFake();
  globalThis.__supabase = nube;
  const fetchOriginal = globalThis.fetch;
  let llamadasFetch = 0;
  globalThis.fetch = async () => { llamadasFetch++; return new Response('{}'); };
  try {
    await paso('enviar a dos promotores guarda mensaje + destinatarios y NO llama a Expo desde el dispositivo', async () => {
      const [a, b] = [randomUUID(), randomUUID()];
      await enviarMensajes([{ cuerpo: 'Ánimo', tipo: 'MANUAL', destinatarios: [{ id: a, nombre: 'A' }, { id: b, nombre: 'B' }] }], { id: randomUUID(), nombre: 'Admin' });
      assert.equal(llamadasFetch, 0, 'el dispositivo sigue llamando a Expo (CORS lo bloquea en el navegador)');
      assert.equal(nube.capturas.filter((c) => c.tabla === 'mensajes').length, 1);
      assert.deepEqual(nube.capturas.filter((c) => c.tabla === 'mensaje_destinatarios').map((c) => c.fila.destinatario_id).sort(), [a, b].sort());
      const esquema = esquemaSupabase();
      for (const { tabla, fila } of nube.capturas) for (const k of Object.keys(fila)) assert.ok(esquema.get(tabla)?.has(k), `${tabla}.${k} no existe en Supabase`);
    });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

console.log('\n== K. Un promotor nunca queda con dos turnos abiertos a la vez ==');
{
  const { iniciarTurno: iniciarTurnoJ } = await imp('db/turnos.ts');

  const dbJ1 = crearDb();
  await aplicar(dbJ1, migs);
  const dispJ1 = await getDispositivoId(dbJ1);
  await sembrarUsuariosDePrueba(dbJ1, dispJ1);
  const promotorJ = await dbJ1.getFirstAsync(`SELECT id, nombre FROM usuarios WHERE pin='8509'`);

  await paso('flujo feliz: sin turno local ni remoto, se crea uno nuevo con su propia selfie', async () => {
    globalThis.__supabase = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ gte: () => ({ order: () => ({ limit: () => ({ returns: async () => ({ data: [], error: null }) }) }) }) }) }) }) }) };
    const turno = await iniciarTurnoJ(dbJ1, { promotorId: promotorJ.id, selfieUri: 'file:///dispositivo1.jpg', latitud: 1, longitud: 1 }, dispJ1);
    assert.equal(turno.selfieUri, 'file:///dispositivo1.jpg');
    const local = await dbJ1.getFirstAsync('SELECT count(*) n FROM turnos');
    assert.equal(local.n, 1);
  });

  await paso('llamar iniciarTurno de nuevo en el MISMO dispositivo reutiliza el turno local (no crea un segundo)', async () => {
    const turno = await iniciarTurnoJ(dbJ1, { promotorId: promotorJ.id, selfieUri: 'file:///otra-selfie.jpg', latitud: 2, longitud: 2 }, dispJ1);
    assert.equal(turno.selfieUri, 'file:///dispositivo1.jpg', 'debió reusar la selfie original, no la nueva');
    const total = await dbJ1.getFirstAsync('SELECT count(*) n FROM turnos');
    assert.equal(total.n, 1);
  });

  const dbJ2 = crearDb();
  await aplicar(dbJ2, migs);
  const dispJ2 = 'j2j2j2j2-0000-4000-8000-000000000000';
  await sembrarUsuariosDePrueba(dbJ2, dispJ2);
  // Mismo promotor real (mismo PIN 8509), pero id LOCAL distinto en cada
  // dispositivo (cada uno generó el suyo al sembrar) — igual que pasaría
  // de verdad, el registro remoto en Supabase se resuelve por identidad de
  // ESTE dispositivo (`datos.promotorId` que pasa el llamador), no por el
  // id que trae la fila remota.
  const promotorJ2 = await dbJ2.getFirstAsync(`SELECT id, nombre FROM usuarios WHERE pin='8509'`);
  await paso('SEGUNDO dispositivo del mismo promotor: no crea un turno duplicado, reusa el remoto con su mismo id', async () => {
    const turnoRemotoId = (await dbJ1.getFirstAsync('SELECT id, hora_inicio FROM turnos LIMIT 1'));
    const fakeJ = crearFake();
    await fakeJ.from('turnos').upsert({
      id: turnoRemotoId.id,
      promotor_id: promotorJ2.id,
      promotor_nombre: promotorJ2.nombre,
      selfie_path: `${turnoRemotoId.id}.jpg`,
      latitud: 1,
      longitud: 1,
      hora_inicio: turnoRemotoId.hora_inicio,
      hora_fin: null,
      dispositivo_id: dispJ1,
    });
    globalThis.__supabase = fakeJ;

    const turno = await iniciarTurnoJ(dbJ2, { promotorId: promotorJ2.id, selfieUri: 'file:///dispositivo2.jpg', latitud: 9, longitud: 9 }, dispJ2);
    assert.equal(turno.id, turnoRemotoId.id, 'debió reusar el id del turno remoto, no generar uno nuevo');

    const localJ2 = await dbJ2.getFirstAsync('SELECT count(*) n FROM turnos');
    assert.equal(localJ2.n, 1, 'debió insertar exactamente una fila local para el turno remoto');

    const { obtenerTurnoAbiertoHoy: obtenerTurnoAbiertoHoyJ } = await imp('db/turnos.ts');
    const gate = await obtenerTurnoAbiertoHoyJ(dbJ2, promotorJ2.id);
    assert.ok(gate, 'el gate local del promotor debe encontrar el turno recién reconciliado');
  });

  await paso('sin red en el segundo intento: sigue creando su propio turno normal (no rompe el flujo offline)', async () => {
    const dbJ3 = crearDb();
    await aplicar(dbJ3, migs);
    const dispJ3 = 'j3j3j3j3-0000-4000-8000-000000000000';
    await sembrarUsuariosDePrueba(dbJ3, dispJ3);
    const otroPromotor = await dbJ3.getFirstAsync(`SELECT id, nombre FROM usuarios WHERE pin='8509'`);
    globalThis.__supabase = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ gte: () => ({ order: () => ({ limit: () => ({ returns: async () => { throw new Error('Network request failed'); } }) }) }) }) }) }) }) };
    const turno = await iniciarTurnoJ(dbJ3, { promotorId: otroPromotor.id, selfieUri: 'file:///offline.jpg', latitud: 3, longitud: 3 }, dispJ3);
    assert.equal(turno.selfieUri, 'file:///offline.jpg');
  });
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} PRUEBA(S) FALLARON`);
process.exit(fallos === 0 ? 0 : 1);
