import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// The browser only needs Firebase Auth. All database access goes through our
// server, so the Firestore SDK (large) is not bundled for visitors.
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Indian users: show Google and SMS screens in the device language.
auth.useDeviceLanguage();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
