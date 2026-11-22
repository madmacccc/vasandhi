import { getApp, getApps, initializeApp } from "@firebase/app";
import {
  getAuth, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut as firebaseSignOut, type Auth, type User,
} from "@firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseAuth: Auth | undefined;

function requireFirebaseAuth(): Auth {
  if (firebaseAuth) return firebaseAuth;

  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Firebase is not configured. Set ${missing.join(", ")} in your environment.`);
  }

  const app = getApps().some((entry) => entry.name === "[DEFAULT]")
    ? getApp()
    : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
  return firebaseAuth;
}

function authError(reason: unknown): Error {
  const code = reason && typeof reason === "object" && "code" in reason && typeof reason.code === "string"
    ? reason.code
    : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return new Error("The email or password is incorrect.");
    case "auth/invalid-email":
      return new Error("Enter a valid admin email address.");
    case "auth/too-many-requests":
      return new Error("Too many attempts. Wait a little while before trying again.");
    case "auth/network-request-failed":
      return new Error("Could not reach Firebase. Check your internet connection.");
    case "auth/user-disabled":
      return new Error("This admin account has been disabled. Contact your Firebase administrator.");
  }
  return reason instanceof Error ? reason : new Error("Authentication failed. Please try again.");
}

export async function signIn(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(requireFirebaseAuth(), email.trim(), password);
  } catch (reason) {
    throw authError(reason);
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(requireFirebaseAuth(), email.trim());
  } catch (reason) {
    throw authError(reason);
  }
}

export async function signOut(): Promise<void> {
  try {
    const auth = requireFirebaseAuth();
    if (auth.currentUser) await firebaseSignOut(auth);
  } catch (reason) {
    throw authError(reason);
  }
}

export function subscribeToAuthChanges(
  onChange: (user: User | null, error?: Error) => void,
): () => void {
  try {
    return onAuthStateChanged(requireFirebaseAuth(), (user) => {
      onChange(user);
    });
  } catch (reason) {
    queueMicrotask(() => onChange(null, authError(reason)));
    return () => undefined;
  }
}
