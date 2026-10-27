// Firebase Admin for the AdPilot console: Firestore (data) and Auth (ID token checks).
// Uses the same Firebase project as the Sarthavaha site (firebase-applet-config.json).
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import webConfig from "../../firebase-applet-config.json" with { type: "json" };

export { webConfig };

/**
 * Credentials: a service account from FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (Netlify),
 * or Application Default Credentials (Cloud Run, local `gcloud auth application-default login`).
 */
export const hasServiceAccount = () => !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

function app() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID || webConfig.projectId;
  const credential = hasServiceAccount()
    ? cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Netlify stores newlines in the key as literal "\n".
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      })
    : applicationDefault();
  return initializeApp({ projectId, credential });
}

let fs;
export const firestore = () => {
  if (fs) return fs;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || webConfig.firestoreDatabaseId;
  fs = databaseId ? getFirestore(app(), databaseId) : getFirestore(app());
  return fs;
};

export const firebaseAuth = () => getAuth(app());
