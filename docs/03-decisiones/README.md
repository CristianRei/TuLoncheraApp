# Decisiones de arquitectura (ADR)

Registro de decisiones técnicas relevantes del proyecto, en el formato
[Architecture Decision Record](https://adr.github.io/). Cada archivo es
inmutable una vez aceptado: si una decisión queda superada, el ADR nuevo la
referencia y explica qué cambió — no se edita el anterior.

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-metodo-autenticacion.md) | Método de autenticación | Aceptado |
| [0002](0002-ventas-sin-evento.md) | Ventas y recargas sin `evento` (por ahora) | Aceptado, parcialmente superado por [0003](0003-stock-de-bodega.md) |
| [0003](0003-stock-de-bodega.md) | Stock de bodega real | Aceptado. Corrige parcialmente [0002](0002-ventas-sin-evento.md) |
| [0004](0004-anulacion-de-ventas.md) | Anulación de ventas (movimiento compensatorio, no borrado) | Aceptado |

## Cómo agregar un ADR nuevo

1. Siguiente número consecutivo, cuatro dígitos: `000N-titulo-corto.md`.
2. Estructura mínima: `# ADR 000N — Título`, `**Estado:**`, `## Contexto`,
   la decisión y sus consecuencias.
3. Si supera un ADR anterior, dilo en ambos: el nuevo lo referencia en su
   contexto: y el anterior se actualiza *solo* en la línea de estado
   (`Aceptado, superado por ADR 000N`), nunca en el cuerpo.
4. Agregar la fila correspondiente a la tabla de arriba.
