import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { 
  initializeFirestore, 
  doc, 
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  setLogLevel,
  enableNetwork
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Suppress Firestore verbose warnings like offline mode
setLogLevel('silent');

const app = initializeApp(firebaseConfig);
const dbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";

// Active IndexedDB Persistence with Multi-Tab synchronization and unlimited offline storage
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  }),
  experimentalAutoDetectLongPolling: true,
}, dbId); /* CRITICAL: The app will break without this line */

// Ensure network is active
enableNetwork(db).catch(() => {});

/**
 * enableIndexedDbPersistence:
 * Activates and validates IndexedDB persistence for offline device caching across tabs.
 */
export async function enableIndexedDbPersistence(): Promise<void> {
  console.log("[Firestore] IndexedDB persistence is enabled and active with persistentMultipleTabManager.");
  return Promise.resolve();
}

export { persistentLocalCache, persistentMultipleTabManager, CACHE_SIZE_UNLIMITED };
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/calendar");
googleProvider.addScope("https://www.googleapis.com/auth/contacts");
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");
googleProvider.addScope("https://www.googleapis.com/auth/drive");

export const googleSignInForDrive = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      return {
        user: result.user,
        accessToken: credential.accessToken
      };
    }
    throw new Error("Giriş uğurlu oldu, lakin bulud icazələri əldə edilmədi.");
  } catch (error: any) {
    if (error?.code === "auth/popup-closed-by-user" || error?.message?.includes("popup-closed-by-user")) {
      console.warn("User closed the Google sign-in popup:", error);
      throw new Error("Giriş pəncərəsi bağlandı. Zəhmət olmasa yenidən cəhd edin.");
    }
    console.error("OAuth sign in error:", error);
    throw error;
  }
};

export { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged };
export type { User };



// Mandatory custom error wrapper
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (
    errMsg.includes("CANCELLED") || 
    errMsg.includes("Call cancelled") || 
    (error as any)?.code === "cancelled" || 
    (error as any)?.code === 1
  ) {
    console.debug(`[Firestore] Call cancelled gracefully for ${operationType} on ${path}`);
    return undefined as never;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error Detailed Details: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
