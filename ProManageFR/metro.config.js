// Metro configuration for Expo
// Exclude Tauri build outputs and native platform folders from Metro’s file watcher
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');

// Inline a minimal exclusionList helper to avoid importing metro-config internals
function exclusionList(patterns) {
  // Metro expects a single RegExp that matches any of the blocked paths
  const sources = patterns.map((p) => (p instanceof RegExp ? p.source : String(p)));
  return new RegExp(sources.join('|'));
}

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.blockList = exclusionList([
  /[\\/]src-tauri[\\/].*?[\\/]target[\\/].*/,
  /[\\/]src-tauri[\\/]target[\\/].*/,
  /[\\/]android[\\/].*/,
  /[\\/]ios[\\/].*/,
  /[\\/]app-example[\\/].*/, // exclude sample app folder
]);

module.exports = config;

// Enhance resolver: add aliases for '@/' and '~/' to project root and log failing module names
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@': path.resolve(__dirname),
  '~': path.resolve(__dirname),
};

// Use Metro's default resolver when a custom one isn't provided by Expo
const originalResolveRequest =
  config.resolver.resolveRequest || ((context, moduleName, platform) => metroResolve(context, moduleName, platform));
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Rewrite alias imports to absolute paths
  if (typeof moduleName === 'string') {
    if (moduleName.startsWith('@/')) {
      const abs = path.join(__dirname, moduleName.slice(2));
      return originalResolveRequest(context, abs, platform);
    }
    if (moduleName.startsWith('~/')) {
      const abs = path.join(__dirname, moduleName.slice(2));
      return originalResolveRequest(context, abs, platform);
    }
  }
  try {
    return originalResolveRequest(context, moduleName, platform);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[metro] Failed to resolve', moduleName, 'from', context?.originModulePath);
    throw e;
  }
};
