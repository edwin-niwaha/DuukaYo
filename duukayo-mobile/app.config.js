const { expo } = require("./app.json");
module.exports = {
  ...expo,
  // Android is autolinked. iOS additionally needs the OAuth callback URL scheme.
  plugins: [
    ...expo.plugins,
    ["expo-image-picker", { photosPermission: "Choose photos for your shop and products.", cameraPermission: false, microphonePermission: false }],
    "./plugins/withWindowsNativePaths",
    ...(process.env.GOOGLE_IOS_URL_SCHEME
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME },
          ],
        ]
      : []),
  ],
};
