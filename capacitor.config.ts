import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.geekore.app',
  appName: 'Geekore',
  server: {
    url: 'https://geekore.geekore.it',
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
      launchShowDuration: 0,       // non nascondere automaticamente
      launchAutoHide: false,       // lo nasconderemo noi da JS
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;