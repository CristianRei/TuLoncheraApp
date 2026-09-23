import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Cargador de módulos para `npm run test:db` (ver prueba.mjs): resuelve los
// alias `@/` y las rutas sin extensión de src/, y reemplaza los módulos que
// solo existen en el celular (expo-crypto, el cliente de Supabase, etc.).
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AQUI, '../../src').replaceAll('\\', '/');
const stub = (nombre) => ({ url: pathToFileURL(path.join(AQUI, 'stubs', nombre)).href, shortCircuit: true });

const REEMPLAZOS = {
  'expo-crypto': 'expo-crypto.mjs',
  'expo-file-system': 'generico.mjs',
  '@/sync/supabaseClient': 'supabaseClient.mjs',
  './supabaseClient': 'supabaseClient.mjs',
  '@/db/client': 'client.mjs',
  '@/sync/push': 'push.mjs',
};

function conExtension(base) {
  for (const c of [base + '.ts', base + '/index.ts']) if (existsSync(c)) return c;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (REEMPLAZOS[specifier]) return stub(REEMPLAZOS[specifier]);
  if (/(^|\/)dispositivo$/.test(specifier)) return stub('dispositivo.mjs');
  if (specifier.startsWith('@/')) {
    const f = conExtension(path.join(SRC, specifier.slice(2)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  if (specifier.startsWith('.') && context.parentURL && context.parentURL.startsWith(pathToFileURL(SRC).href) && !/\.(ts|mjs|js)$/.test(specifier)) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    const f = conExtension(base);
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
