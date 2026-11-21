import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence, browserPopupRedirectResolver, browserSessionPersistence,
  getRedirectResult, GoogleAuthProvider, initializeAuth, onAuthStateChanged, signInWithRedirect, signOut
} from 'firebase/auth';

let auth;

export async function connectGoogleAuth() {
  if (!auth) {
    const response = await fetch('/__/firebase/init.json', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('Google sign-in configuration unavailable');
    const { apiKey, appId, projectId } = await response.json();
    if (projectId !== 'star-strike-rush' || typeof apiKey !== 'string' || typeof appId !== 'string') {
      throw Error('Unexpected Firebase project configuration');
    }
    const app = initializeApp({ apiKey, appId, projectId, authDomain: location.host }, 'stellar-google-auth');
    auth = initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver
    });
  }
  return {
    ready: () => auth.authStateReady(),
    signedIn: () => auth.currentUser?.providerData.some(({ providerId }) => providerId === 'google.com') ?? false,
    observe: (listener) => onAuthStateChanged(auth, listener),
    complete: () => getRedirectResult(auth),
    signIn: () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return signInWithRedirect(auth, provider);
    },
    signOut: () => signOut(auth)
  };
}
