const { expo } = require("./app.json");
module.exports = {
  ...expo,
  // Android is autolinked. iOS additionally needs the OAuth callback URL scheme.
  plugins: [
    ...expo.plugins,
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
