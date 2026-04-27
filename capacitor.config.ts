import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.geekore.app',
  appName: 'Geekore',
  webDir: 'out',
  server: {
    url: 'https://geekore.it',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#000000',
  },
};

export default config;