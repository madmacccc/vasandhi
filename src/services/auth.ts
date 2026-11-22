import { getApp, getApps, initializeApp } from "@firebase/app";
import {
  getAuth, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut as firebaseSignOut, type Auth, type User,
} from "@firebase/auth";
import type { Session } from "@supabase/supabase-js";
import { requireSupabase } from "./supabase";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseAuth: Auth | undefined;
const sessionExchanges = new Map<string, { token: string; session: Promise<Session> }>();

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

async function exchangeFirebaseSession(user: User): Promise<Session> {
  const token = await user.getIdToken();
  const cached = sessionExchanges.get(user.uid);
  if (cached?.token === token) return cached.session;

  const session = (async () => {
    const { data, error } = await requireSupabase().auth.signInWithIdToken({
      provider: "firebase",
      token,
    });
    if (error) {
      const detail = error.message.trim();
      throw new Error(
        `Firebase sign-in worked, but Supabase rejected the Firebase identity: ${detail}. ` +
        "Enable Firebase as a third-party provider in Supabase Authentication settings and set its Firebase project ID to " +
        `${firebaseConfig.projectId}.`,
      );
    }
    if (!data.session) throw new Error("Supabase did not return an authenticated session.");
    return data.session;
  })();
  sessionExchanges.set(user.uid, { token, session });
  try {
    return await session;
  } catch (reason) {
    if (sessionExchanges.get(user.uid)?.session === session) sessionExchanges.delete(user.uid);
    throw reason;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  try {
    const { user } = await signInWithEmailAndPassword(requireFirebaseAuth(), email.trim(), password);
    await exchangeFirebaseSession(user);
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
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  } catch (reason) {
    throw authError(reason);
  }
}

export function subscribeToAuthChanges(
  onChange: (session: Session | null, error?: Error) => void,
): () => void {
  try {
    return onAuthStateChanged(requireFirebaseAuth(), (user) => {
      void (async () => {
        try {
          if (!user) {
            const { error } = await requireSupabase().auth.signOut();
            if (error) throw error;
            onChange(null);
            return;
          }
          onChange(await exchangeFirebaseSession(user));
        } catch (reason) {
          onChange(null, authError(reason));
        }
      })();
    });
  } catch (reason) {
    queueMicrotask(() => onChange(null, authError(reason)));
    return () => undefined;
  }
}

export async function resolveShop(userId: string): Promise<string> {
  const client = requireSupabase();
  const { data: membership, error } = await client
    .from("shop_memberships")
    .select("shop_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (membership) return membership.shop_id;

  const { data: shopId, error: bootstrapError } = await client.rpc("bootstrap_shop", {
    shop_name: "Sri Vasanthi Jewellery Pawn Broker",
  });
  if (bootstrapError) throw bootstrapError;
  if (typeof shopId !== "string") throw new Error("Supabase did not return a shop ID.");
  return shopId;
}
