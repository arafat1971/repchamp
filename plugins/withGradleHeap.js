/**
 * Give the Gradle daemon a bigger heap so R8 can finish.
 *
 * R8 minification runs inside the Gradle daemon, and the Expo template caps
 * that at `-Xmx2048m`. With `enableMinifyInReleaseBuilds` on, a local release
 * build exhausted it ("Daemon will expire after the build after running out of
 * JVM heap space") and ground along for 30+ minutes without finishing; the same
 * build with a 4 GB heap completed in about 12.
 */
const { withGradleProperties } = require('@expo/config-plugins');

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

module.exports = function withGradleHeap(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'),
    );
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
};
