// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite en modo web (alpha) carga su motor como .wasm — Metro no lo
// trata como asset por defecto. Ver https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (que usa expo-sqlite en web) requiere estos headers en
// el servidor de desarrollo, no solo en producción (app.json ya los tiene
// para EAS). Sin esto, la base de datos no abre en el navegador.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;
