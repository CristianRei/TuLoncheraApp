import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDispositivoId } from '../dispositivo';
import type { Migracion } from './index';

interface ProductoInicial {
  sku: string;
  nombre: string;
  precio: number;
  esLicor?: boolean;
}

/**
 * Catálogo real compartido por el cliente
 * (C:\Users\reina\Documents\ProductosPreciosLonchera.xlsx — código, nombre,
 * precio). El `sku` es el código de esa hoja con prefijo `TL`, para poder
 * rastrear cualquier fila hasta el archivo original. `esLicor` se marcó solo
 * en los productos inequívocamente alcohólicos (vinos y cerveza) — el resto
 * de clasificaciones (categoría, costo, perecedero) no vinieron en la hoja,
 * así que quedan vacías en vez de inventadas (CLAUDE.md sección 8).
 */
const PRODUCTOS_INICIALES: ProductoInicial[] = [
  { sku: 'TL001', nombre: 'CHOCO GALLETA RAMO', precio: 3000 },
  { sku: 'TL002', nombre: 'PINGUINO 80 G 2 PORCIONES', precio: 3900 },
  { sku: 'TL003', nombre: 'GOMAS TRULULU NANO X 100 GR', precio: 3500 },
  { sku: 'TL004', nombre: 'ZUCARITAS X 36 GR', precio: 1300 },
  { sku: 'TL005', nombre: 'GOMA COLAGENO X 70 GR', precio: 3700 },
  { sku: 'TL006', nombre: 'GOMA GRISLY X 80 GR UND', precio: 2500 },
  { sku: 'TL007', nombre: 'SUPER HUEVO ELITE', precio: 10000 },
  { sku: 'TL008', nombre: 'PAPA PRINGLES 37 Y 40 GR ORIG-ADOBADA Y CEBOLL', precio: 6500 },
  { sku: 'TL009', nombre: 'AREQUIPE ALQUERIA X 150 GR', precio: 5000 },
  { sku: 'TL010', nombre: 'GOMA BOMBOMBUN', precio: 1500 },
  { sku: 'TL011', nombre: 'GALLETA CHUSQUITAS MAMAINES X22 GR', precio: 1000 },
  { sku: 'TL012', nombre: 'PONQUE RAMO TRADICIONAL 230', precio: 7000 },
  { sku: 'TL013', nombre: 'PONQUÉ TRAD SELECTA FRUTOS SILV 230GR', precio: 9800 },
  { sku: 'TL014', nombre: 'CACERO MARMOLADO TRES LECHES', precio: 8700 },
  { sku: 'TL015', nombre: 'RAMITO X 8', precio: 8800 },
  { sku: 'TL016', nombre: 'LONCHIMIX 1P 169G', precio: 6600 },
  { sku: 'TL017', nombre: 'BIMBOLETES X 10 UND', precio: 10500 },
  { sku: 'TL018', nombre: 'GANSITO X 6 TRADICIONAL', precio: 12800 },
  { sku: 'TL019', nombre: 'SUBMARINO X 6', precio: 9300 },
  { sku: 'TL020', nombre: 'BARRITA DE CHOCORAMO X 5', precio: 11500 },
  { sku: 'TL021', nombre: 'CHOCORAMO TAJADA X 5', precio: 13500 },
  { sku: 'TL022', nombre: 'GALA TAJADA MITI X 12', precio: 15600 },
  { sku: 'TL023', nombre: 'PQUE FAM FRUTAS*11 TAJ*410 G', precio: 11700 },
  { sku: 'TL024', nombre: 'TORTA CHOCOLATE', precio: 21000 },
  { sku: 'TL025', nombre: 'GANSITO MINI 12 UND X 20g', precio: 15500 },
  { sku: 'TL026', nombre: 'MINIX PINGÜINO 1P X 240 GR', precio: 13000 },
  { sku: 'TL027', nombre: 'MINIX CHOCOSO X 400 GR', precio: 18000 },
  { sku: 'TL028', nombre: 'CHOCORAMO MINI X 20', precio: 18500 },
  { sku: 'TL029', nombre: 'MINIX BROWNIES X 310G BIMBO', precio: 16000 },
  { sku: 'TL030', nombre: 'BROWNIE AREQUIPE MINI 20 GR X 12', precio: 15500 },
  { sku: 'TL031', nombre: 'PAN DE AROZ MINI X 40 GR X 6 UN', precio: 16800 },
  { sku: 'TL032', nombre: 'BIZCOCHO DE ACHIRA DOC X 25 GR', precio: 26000 },
  { sku: 'TL033', nombre: 'DELIMANI NATURAL 36G X12', precio: 21000 },
  { sku: 'TL034', nombre: 'DELIMANI CON UVAS PASAS 36G X12', precio: 21000 },
  { sku: 'TL035', nombre: 'LONCHERA MANI SAL MANITOBA X 6 UN X 300 GR', precio: 11500 },
  { sku: 'TL036', nombre: 'LONCHERA X 6 UN MANITOBA X 280', precio: 17500 },
  { sku: 'TL037', nombre: 'GRANOLA SUPERIOR X 450', precio: 12200 },
  { sku: 'TL038', nombre: 'MAX GRANOLA X 450 G', precio: 8500 },
  { sku: 'TL039', nombre: 'GRANOLA FRUTOS TROPICALES X 500', precio: 12200 },
  { sku: 'TL040', nombre: 'MAIZITOS AREPITAS X 6', precio: 9600 },
  { sku: 'TL041', nombre: 'PLATANOS MADUROS Y VERDES X 6', precio: 13000 },
  { sku: 'TL042', nombre: 'PASABOCAS CON QUINUA Y MAIZ X 6 UND', precio: 5900 },
  { sku: 'TL043', nombre: 'AREPITAS RAMO FAMILIAR X 150 GR', precio: 6000 },
  { sku: 'TL044', nombre: 'TOSTACO PICANTE FAMILIAR', precio: 8500 },
  { sku: 'TL045', nombre: 'TOSTACO QUESO FAMILIAR', precio: 8500 },
  { sku: 'TL046', nombre: 'MAIZITOS FAMILIAR X 200', precio: 8500 },
  { sku: 'TL047', nombre: 'PAPAS RAMO PACHAS 105 GR FAMILIAR', precio: 7900 },
  { sku: 'TL048', nombre: 'SURTIDA FANATICA X 15 UN', precio: 16500 },
  { sku: 'TL049', nombre: 'TODO RICO BBQ 45 GR X 8', precio: 21000 },
  { sku: 'TL050', nombre: 'TODO RICO NATURAL 45 GR X 8', precio: 21000 },
  { sku: 'TL051', nombre: 'TROCITOS POLLO 30GR X 12', precio: 17000 },
  { sku: 'TL052', nombre: 'PAPA POLLO 25 GR X 12', precio: 21000 },
  { sku: 'TL053', nombre: 'MAIZITOS NATURAL 30GX2X12 CAN', precio: 15000 },
  { sku: 'TL054', nombre: 'TOSTACO PTE25GX2X12 CAN', precio: 15000 },
  { sku: 'TL055', nombre: 'TOSTACOS QUESO 25GX2X12 CAN', precio: 15000 },
  { sku: 'TL056', nombre: 'YUQUILLAS X 35GR X 6 UND', precio: 12000 },
  { sku: 'TL057', nombre: 'CHICHARRON PICANTE X 50 GR X 6 UND', precio: 15600 },
  { sku: 'TL058', nombre: 'GALLETA SURT#1 PQ*6 UND*252 G', precio: 7900 },
  { sku: 'TL059', nombre: 'GALLETA LIMONA RAMO x 8', precio: 6500 },
  { sku: 'TL060', nombre: 'GALLETA LECHE RAMO x 8', precio: 6500 },
  { sku: 'TL061', nombre: 'CHOKIS CHISPAS 37 G * 47 15 X 6', precio: 10800 },
  { sku: 'TL062', nombre: 'NUCITA WAFER GALLETA X8 UND', precio: 6000 },
  { sku: 'TL063', nombre: 'GALLETA MUUU LECHE', precio: 6000 },
  { sku: 'TL064', nombre: 'CLUB SOCIAL NAVISCO PQTE', precio: 9000 },
  { sku: 'TL065', nombre: 'GALLETA OREO X 6 UND', precio: 10600 },
  { sku: 'TL066', nombre: 'GALLETA TOCHS *9 UND', precio: 9600 },
  { sku: 'TL067', nombre: 'GALLETA QUAKER X 6', precio: 10200 },
  { sku: 'TL068', nombre: 'PIAZZA JIRAFA X 24 SABORES SURTIDOS', precio: 12500 },
  { sku: 'TL069', nombre: 'QUIMBAYA X 18 UN', precio: 13800 },
  { sku: 'TL070', nombre: 'BOM BON BUM FRESA (15BS-24-19G)', precio: 13000 },
  { sku: 'TL071', nombre: 'NUCITA CREMA CAL ESPARCIBLE X 18 UND', precio: 12900 },
  { sku: 'TL072', nombre: 'CHOCMELOS (18BS/30/4,8g)', precio: 10500 },
  { sku: 'TL073', nombre: 'ITALO WAFER TACO X 117 GR', precio: 4200 },
  { sku: 'TL074', nombre: 'MAX COCO WAFER X 10 PQTE X 46 GR', precio: 17900 },
  { sku: 'TL075', nombre: 'CRAKEÑAS DIPZ X 12 PAQ X 180 GR', precio: 5200 },
  { sku: 'TL076', nombre: 'DELECHITAS', precio: 5000 },
  { sku: 'TL077', nombre: 'GOLOZETAS', precio: 6000 },
  { sku: 'TL078', nombre: 'DOMO GALLETA CASERA', precio: 10000 },
  { sku: 'TL079', nombre: 'COL 100% MULTI CERE AL AVENA MIEL Y FRUTOS ROJOS', precio: 8600 },
  { sku: 'TL080', nombre: 'COL 100% CLUB MULTIGRANO X6X25 GR', precio: 6900 },
  { sku: 'TL081', nombre: 'COL 100% AVENA Y GRANOLA X6X30GR', precio: 9900 },
  { sku: 'TL082', nombre: 'COL 100% SANDWICH - YOG Y ACAI X6 X 23 GR', precio: 9900 },
  { sku: 'TL083', nombre: 'PAN TAJADO ARTESANO', precio: 7000 },
  { sku: 'TL084', nombre: 'BARRA DE CEREAL COLOMBINA 100% CON FIBRA X 138 G', precio: 9500 },
  { sku: 'TL085', nombre: 'ZUC +MALVAVISCOS X 230', precio: 15000 },
  { sku: 'TL086', nombre: 'CORN FLAKES CAJA X 410 GR', precio: 17500 },
  { sku: 'TL087', nombre: 'MUSLI MANZANA-ARANDANOS', precio: 19800 },
  { sku: 'TL088', nombre: 'CHOCOCRISPIS Y ZUCARITAS CAJA 570 Y 610', precio: 26000 },
  { sku: 'TL089', nombre: 'BOLSA CHOCO-ZUC Y FRLOOPS X 115 GR', precio: 5600 },
  { sku: 'TL090', nombre: 'VARIEDAD NINO ZUC .CHOCO X 6 CAJITAS', precio: 12500 },
  { sku: 'TL091', nombre: 'SALCHICHON PLASTICO CARNE VERDE', precio: 12000 },
  { sku: 'TL092', nombre: 'SALCHICHON ESCAMOSO AZUL', precio: 12000 },
  { sku: 'TL093', nombre: 'SALCHICHAS LATA RONDA 95 GR', precio: 5200 },
  { sku: 'TL094', nombre: 'JUGO NECTAR SURT 7 X 10', precio: 17500 },
  { sku: 'TL095', nombre: 'REFRESCO FRESKY TETRA 200ML 5X6', precio: 6900 },
  { sku: 'TL096', nombre: 'GARRAFA DE YOGURT SURTIDO (FRESA,MORA,FRUTOS)', precio: 15000 },
  { sku: 'TL097', nombre: 'AVENA PRO CUBANA X 1000 ML ALQUERIA', precio: 9000 },
  { sku: 'TL098', nombre: 'FORTIKIDS CHOCOLECHE X 6 UND ALQ', precio: 12600 },
  { sku: 'TL099', nombre: 'ALQUE MIX M&M X 4 UND', precio: 12400 },
  { sku: 'TL100', nombre: 'ALQUERIA MIX TRULULU PACK X 4 UND', precio: 12400 },
  { sku: 'TL101', nombre: 'ALQUERIA CREMOSO Y BEBIBLE PACK X 6', precio: 6500 },
  { sku: 'TL102', nombre: 'NATILLA X 300 GR', precio: 9900 },
  { sku: 'TL103', nombre: 'GALLETA FELIZ NAVIDAD COLOMBINA X 200 GR', precio: 5900 },
  { sku: 'TL104', nombre: 'VINO MONSERRATE', precio: 10000, esLicor: true },
  { sku: 'TL105', nombre: 'VINO LA MERCED', precio: 14000, esLicor: true },
  { sku: 'TL106', nombre: 'MERMELADA COLOMBINA LA CONSTANCIA', precio: 5800 },
  { sku: 'TL107', nombre: 'ATUN VANCAMPS', precio: 5000 },
  { sku: 'TL108', nombre: 'PQTE DULCE FIESTA X 300', precio: 11900 },
  { sku: 'TL109', nombre: 'KICK MANI MINI x 12 un', precio: 9800 },
  { sku: 'TL110', nombre: 'BB BARRA CRUNCHY BERRIES', precio: 11000 },
  { sku: 'TL111', nombre: 'CERVEZA SIXPACK X 6', precio: 99900, esLicor: true },
  { sku: 'TL112', nombre: 'CHETOS UND', precio: 2000 },
  { sku: 'TL113', nombre: 'YOGURT SUPER VASO 130GR GOMAS X 5 UN', precio: 12900 },
  { sku: 'TL114', nombre: 'BONYURT KIDS ALQUERIA X 6 UND', precio: 11800 },
  { sku: 'TL115', nombre: 'CROKING PLATANO SLICES TAJADAS X 200 GR', precio: 10900 },
  { sku: 'TL116', nombre: 'LONCHERA MIX NUECES MANITOBA X 6 X 240 GR', precio: 14500 },
  { sku: 'TL117', nombre: 'ACHIRA X 120 GR FAMILIAR', precio: 10500 },
  { sku: 'TL118', nombre: 'CEREAL EN BOLSA DE HOJUELAS DE MAIZ SUNSHINE CEREALS 300GR', precio: 8000 },
  { sku: 'TL119', nombre: 'CEREAL EN BOLSA DE ARROZ ACHOCOLATADO SUNSHINE CEREALS 320GR', precio: 8000 },
  {
    sku: 'TL120',
    nombre: 'CEREAL EN BOLSA DE ARITOS AFRUTADOS SUNSHINE CEREALS 2 UND DE 35GR',
    precio: 1200,
  },
  { sku: 'TL121', nombre: 'CHAMPITAS RAMO X 6', precio: 13600 },
  { sku: 'TL122', nombre: 'COMBOS FAMILIAR', precio: 60000 },
  { sku: 'TL123', nombre: 'BOLSAS PLASTICAS', precio: 0 },
];

export const migracion0005CargaCatalogoInicial: Migracion = {
  version: 5,
  nombre: 'carga_catalogo_inicial',
  async up(db: SQLiteDatabase) {
    const ahora = new Date().toISOString();
    const dispositivoId = await getDispositivoId(db);

    for (const producto of PRODUCTOS_INICIALES) {
      await db.runAsync(
        `INSERT INTO productos (id, sku, nombre, precio, es_licor, ts_cliente, dispositivo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          producto.sku,
          producto.nombre,
          producto.precio,
          producto.esLicor ? 1 : 0,
          ahora,
          dispositivoId,
        ]
      );
    }
  },
};
