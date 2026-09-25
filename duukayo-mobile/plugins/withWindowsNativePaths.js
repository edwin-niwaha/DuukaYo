const { withAppBuildGradle } = require("expo/config-plugins");

const marker = "// DuukaYo: shorten Windows native object paths";
const gradleBlock = `
${marker}
if (System.getProperty("os.name").startsWith("Windows")) {
    android {
        externalNativeBuild {
            cmake {
                buildStagingDirectory file("../../.cxx")
            }
        }
        defaultConfig {
            externalNativeBuild {
                cmake {
                    arguments "-DCMAKE_OBJECT_PATH_MAX=250"
                }
            }
        }
    }
}
`;

function addWindowsNativePaths(contents) {
  return contents.includes(marker) ? contents : contents + "\n" + gradleBlock;
}

module.exports = function withWindowsNativePaths(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("Windows native path configuration requires Groovy build.gradle");
    }
    config.modResults.contents = addWindowsNativePaths(config.modResults.contents);
    return config;
  });
};

module.exports.addWindowsNativePaths = addWindowsNativePaths;
