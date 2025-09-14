// Patch expo-router head resolution on Windows Metro if needed
const fs = require('fs');
const path = require('path');

// No-op: shim disabled since it can shadow the real Head implementation and cause runtime errors
try {
  const pkgRoot = process.cwd();
  const headShim = path.join(pkgRoot, 'node_modules', 'expo-router', 'build', 'head.js');
  if (fs.existsSync(headShim)) {
    fs.unlinkSync(headShim);
    console.log('Removed leftover expo-router head.js shim');
  }
} catch (e) {
  console.warn('postinstall-fix-expo-router noop failed:', e.message);
}
