/**
 * Make resource shrinking safe for this app.
 *
 * Resource shrinking drops anything it can't see referenced from code. React
 * Native resolves bundled images by name at runtime (getIdentifier) and the
 * sound effects live in res/raw, so a plain shrink would strip them in release
 * only. This keeps those resource types and lets everything else (unused
 * layouts, strings, library resources) be shrunk.
 *
 * `android/` is generated, so this is written on every prebuild.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KEEP_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@drawable/*,@raw/*,@mipmap/*,@xml/*" />
`;

module.exports = function withResourceKeep(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'keep.xml'), KEEP_XML);
      return cfg;
    },
  ]);
};
