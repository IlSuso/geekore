import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.geekore.app',
  appName: 'Geekore',
  server: {
    url: 'https://geekore.it',
    cleartext: false,
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,     // splash visibile ~1.8s
      launchAutoHide: true,         // sparisce automaticamente
      launchFadeOutDuration: 400,   // fade out 400ms — fluido come IG
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',   // logo centrato, non stretchato
      showSpinner: false,
    },
  },
};

export default config;