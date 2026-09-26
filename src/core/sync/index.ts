// Traduce el error crudo de una subida a Supabase a qué pasó y qué hacer.
// TypeScript puro (CLAUDE.md sección 6). Lo usa el diagnóstico de
// sincronización del admin (app/admin/sync/): antes solo se veía el mensaje
// técnico de Postgres, y un esquema remoto desactualizado (ej. una migración
// vieja aplicada) dejaba cosas sin llegar a los celulares sin que nadie lo
// notara.

export interface ExplicacionErrorSync {
  /** Qué pasó, en una frase. */
  titulo: string;
  /** Qué hacer para que se destrabe. */
  accion: string;
}

/** Migración de supabase/migraciones que crea o actualiza cada tabla remota. */
const MIGRACION_POR_TABLA: Record<string, string> = {
  turnos: '0016_realtime_turnos_arqueos.sql (y 0001)',
  comprobantes_venta: '0001_turnos_y_comprobantes.sql',
  ventas: '0009_sincronizacion_completa.sql',
  venta_items: '0009_sincronizacion_completa.sql',
  movimientos: '0009_sincronizacion_completa.sql',
  lotes: '0009_sincronizacion_completa.sql',
  cargues: '0009_sincronizacion_completa.sql',
  cargue_lineas: '0009_sincronizacion_completa.sql',
  conteos: '0009_sincronizacion_completa.sql',
  conteo_lineas: '0009_sincronizacion_completa.sql',
  arqueos_caja: '0009_sincronizacion_completa.sql',
  categorias: '0009_sincronizacion_completa.sql',
  productos: '0009_sincronizacion_completa.sql',
  mensajes: '0009_sincronizacion_completa.sql',
  mensaje_destinatarios: '0009_sincronizacion_completa.sql',
  push_tokens: '0009_sincronizacion_completa.sql',
  intentos_pin_fallidos: '0010_seguridad_pin.sql',
  logins_exitosos_pin: '0010_seguridad_pin.sql',
  desbloqueos_pin: '0018_credenciales_privadas.sql (y 0010)',
  traslados: '0011_traslados.sql',
  traslado_lineas: '0011_traslados.sql',
  empresas: '0012_empresas_puntos.sql',
  puntos: '0012_empresas_puntos.sql',
  eventos: '0014_eventos.sql',
  descuentos: '0015_descuentos.sql',
  usuarios: '0018_credenciales_privadas.sql',
};

function migracionDe(tabla: string): string {
  return MIGRACION_POR_TABLA[tabla] ?? 'la migración de esa tabla';
}

export function explicarErrorSync(tabla: string, error: string): ExplicacionErrorSync {
  const columna =
    error.match(/column [\w"]*?\.?"?(\w+)"? (?:of relation \S+ )?does not exist/i)?.[1] ??
    error.match(/Could not find the '(\w+)' column/i)?.[1];
  if (columna) {
    return {
      titulo: `Supabase no tiene la columna "${columna}" en ${tabla}: tiene aplicada una versión vieja de la migración.`,
      accion: `Vuelve a correr supabase/migraciones/${migracionDe(tabla)} en el SQL Editor (se puede repetir sin riesgo).`,
    };
  }
  if (/relation "?[\w.]+"? does not exist|Could not find the table/i.test(error)) {
    return {
      titulo: `La tabla ${tabla} no existe en Supabase.`,
      accion: `Corre supabase/migraciones/${migracionDe(tabla)} en el SQL Editor.`,
    };
  }
  if (/Could not find the function|function [\w.]+\(.*\) does not exist/i.test(error)) {
    return {
      titulo: 'A Supabase le faltan las funciones de seguridad de PIN.',
      accion: 'Corre supabase/migraciones/0018_credenciales_privadas.sql en el SQL Editor.',
    };
  }
  if (/administrador inicie sesión/i.test(error)) {
    return {
      titulo: 'Los cambios de personal los firma el admin con sesión abierta, y no hay ninguno.',
      accion: 'Inicia sesión como administrador en este equipo; se sube solo en unos segundos.',
    };
  }
  if (/no reconoce el PIN|registrar_admin/i.test(error)) {
    return {
      titulo: 'Supabase no reconoce el PIN del administrador con sesión abierta.',
      accion:
        "Entra con un admin registrado, o regístralo en el SQL Editor: select registrar_admin('Nombre', 'PIN de 6 dígitos');",
    };
  }
  if (/DEMASIADOS_INTENTOS/.test(error)) {
    return {
      titulo: 'Supabase frenó la verificación de PIN por demasiados intentos fallidos.',
      accion: 'Espera unos 10 minutos; se reintenta solo.',
    };
  }
  if (/permission denied|row-level security|violates row-level/i.test(error)) {
    return {
      titulo: `Supabase no permite escribir en ${tabla}.`,
      accion: `Revisa que supabase/migraciones/${migracionDe(tabla)} esté aplicada completa.`,
    };
  }
  if (/network|failed to fetch|fetch failed|timeout|tiempo de espera|sesión de supabase|EXPO_PUBLIC_SUPABASE/i.test(error)) {
    return {
      titulo: 'No hay conexión con Supabase.',
      accion: 'Se reintenta solo cuando vuelva la conexión.',
    };
  }
  return {
    titulo: 'Supabase rechazó este cambio.',
    accion: 'Revisa el detalle técnico de abajo.',
  };
}
