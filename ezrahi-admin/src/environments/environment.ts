export const environment = {
  production: false,
  // Web app config from ./firebase.config.js (gitignored, kept out of the repo).
  firebase: {
    apiKey: 'AIzaSyBhyAH5DwJDqqmQOF68uZR00YhWAXdK-tA',
    authDomain: 'ezrahi.firebaseapp.com',
    databaseURL: 'https://ezrahi.firebaseio.com',
    projectId: 'ezrahi',
    storageBucket: 'ezrahi.appspot.com',
    messagingSenderId: '556352200875',
    appId: '1:556352200875:web:bdcbe80dc8c6ed636297ee',
    measurementId: 'G-LCFD553L9R',
  },
  // Set to true to talk to the local emulators (see Android repo firebase.json:
  // auth 9099, firestore 8080). Functions emulator default port 5001.
  useEmulators: false,
};
