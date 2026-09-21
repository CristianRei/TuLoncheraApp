// Lógica compartida de grilla de mes entre CalendarioRango y SelectorFechaUnica.
export const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const NOMBRES_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function aClaveFecha(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Días del mes en celdas de semana (lunes a domingo), con null para relleno fuera de mes. */
export function construirGrilla(anio: number, mes: number): (number | null)[][] {
  const primerDia = new Date(anio, mes, 1).getDay();
  // getDay(): 0=domingo..6=sábado → convertir a offset lunes=0..domingo=6
  const offsetLunes = (primerDia + 6) % 7;
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const celdas: (number | null)[] = [
    ...Array(offsetLunes).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: (number | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) {
    semanas.push(celdas.slice(i, i + 7));
  }
  return semanas;
}
