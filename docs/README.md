# Documentación — Tu Lonchera

Índice de toda la documentación del proyecto. El contexto denso y siempre
vigente vive en [`CLAUDE.md`](../CLAUDE.md) (raíz del repo); aquí están los
detalles largos que ese archivo referencia bajo demanda.

## Documentación técnica

| Documento | Contenido |
|---|---|
| `01-proceso-actual.md` | Mapeo AS-IS del proceso de negocio real. **Todavía no existe.** |
| [`02-modelo-datos.md`](02-modelo-datos.md) | Esquema completo de la base de datos y el razonamiento detrás de cada tabla. |
| [`03-decisiones/`](03-decisiones/README.md) | ADRs — decisiones de arquitectura numeradas y su estado actual. |

## Material comercial

| Documento | Contenido |
|---|---|
| [`comercial/propuesta/`](comercial/propuesta/propuesta_final.pdf) | Propuesta técnico-comercial. Fuente: `propuesta.tex`. `propuesta.pdf` se regenera desde ahí; `propuesta_final.pdf` es el nombre de entrega al cliente — mantenerlos sincronizados al editar. |

Este material es de negocio (ventas, precios, cronograma comercial), no
documentación técnica del producto — vive separado a propósito.

**No hay LaTeX instalado localmente.** Para recompilar el PDF: descargar el
binario portable `tectonic` (GitHub releases del proyecto
`tectonic-typesetting/tectonic`, build `x86_64-pc-windows-msvc`, sin
instalador), correrlo una vez sobre `propuesta.tex`, y borrar el binario
después — nunca instalar MiKTeX/TeX Live ni nada permanente solo para esto.
