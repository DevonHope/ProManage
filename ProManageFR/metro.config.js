// Metro configuration for Expo
// Exclude Tauri build outputs and native platform folders from Metro’s file watcher
const { getDefaultConfig } = require('expo/metro-config');

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
]);

module.exports = config;
