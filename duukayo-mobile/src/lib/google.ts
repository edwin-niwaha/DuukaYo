import Constants from "expo-constants";
import { Platform } from "react-native";
import { signInWithGoogleToken } from "./api";
export const googleConfigured = Boolean(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
);
export async function signInWithGoogle() {
  if (Constants.appOwnership === "expo" || Platform.OS === "web")
    throw new Error(
      "Use the installed mobile app for Google sign-in, or open the web dashboard.",
    );
  if (!googleConfigured) throw new Error("Google sign-in is not configured.");
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } =
    await import("@react-native-google-signin/google-signin");
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut();
    const result = await GoogleSignin.signIn();
    if (!isSuccessResponse(result)) return null;
    if (!result.data.idToken)
      throw new Error("Google did not return a sign-in token. Please retry.");
    return await signInWithGoogleToken(result.data.idToken);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED)
      return null;
    throw error;
  }
}
