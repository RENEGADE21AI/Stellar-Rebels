const returnKey = 'stellar.google-return';

export const googleSignInAvailable = document.documentElement.dataset.googleSignIn === 'true' &&
  location.origin === 'https://stellar-rebels.web.app';

export function pendingGoogleReturn() {
  try { return sessionStorage.getItem(returnKey) === 'pending'; }
  catch { return false; }
}

function clearGoogleReturn() {
  try { sessionStorage.removeItem(returnKey); }
  catch { /* The browser is blocking storage. */ }
}

function explain(error, fallback) {
  switch (error?.code) {
    case 'auth/network-request-failed':
      return 'Could not reach Google. Check your connection and try again.';
    case 'auth/web-storage-unsupported':
      return 'This browser is blocking the storage required for sign-in.';
    case 'auth/account-exists-with-different-credential':
      return 'This Google address is already registered with another sign-in method.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
    case 'auth/app-not-authorized':
    case 'auth/invalid-api-key':
      return 'Google sign-in is unavailable right now.';
    default:
      return fallback;
  }
}

export function createGoogleAccount(update) {
  let driver;
  let phase = 'loading';
  let loadRetry = 0;

  function show(next, notice) {
    phase = next;
    update({ phase, notice });
  }

  function ready(notice) {
    const signedIn = driver.signedIn();
    show(signedIn ? 'connected' : 'guest', notice ??
      (signedIn ? 'Signed in with Google.' : 'Playing as a guest.'));
  }

  async function open(returning = pendingGoogleReturn()) {
    if (!googleSignInAvailable || (phase === 'signing-in' && !returning) || phase === 'signing-out') return;
    if (!navigator.onLine && !driver) {
      show('retry', 'Reconnect to manage Google sign-in. Guest play is available offline.');
      return;
    }
    if (phase === 'connecting') return;
    show('connecting', returning ? 'Finishing Google sign-in…' : 'Checking account…');
    try {
      if (!driver) {
        const moduleUrl = new URL('./google-auth-vendor.mjs', import.meta.url);
        if (loadRetry) moduleUrl.searchParams.set('retry', loadRetry);
        const { connectGoogleAuth } = await import(moduleUrl.href).catch((error) => {
          loadRetry++;
          throw error;
        });
        driver = await connectGoogleAuth();
        driver.observe(() => {
          const signedIn = driver.signedIn();
          if ((phase === 'guest' && signedIn) || (phase === 'connected' && !signedIn)) ready();
        });
      }
      const result = returning ? await driver.complete().finally(clearGoogleReturn) : null;
      await driver.ready();
      ready(returning && !result && !driver.signedIn() ? 'Sign-in was canceled. You can keep playing as a guest.' : undefined);
    } catch (error) {
      const notice = explain(error, 'Could not check Google sign-in. Try again or keep playing as a guest.');
      if (driver && returning) ready(notice);
      else show('retry', notice);
    }
  }

  async function signIn() {
    if (phase !== 'guest') return;
    if (!navigator.onLine) {
      ready('Reconnect to sign in with Google.');
      return;
    }
    try { sessionStorage.setItem(returnKey, 'pending'); }
    catch {
      ready('This browser is blocking the storage required for sign-in.');
      return;
    }
    show('signing-in', 'Opening Google sign-in…');
    try {
      await driver.signIn();
      clearGoogleReturn();
      ready();
    } catch (error) {
      clearGoogleReturn();
      ready(explain(error, 'Could not sign in with Google. Try again or keep playing as a guest.'));
    }
  }

  async function signOut() {
    if (phase !== 'connected') return;
    show('signing-out', 'Signing out…');
    try {
      await driver.signOut();
      ready('Signed out. Your Arcade progress is still on this device.');
    } catch {
      ready('Could not sign out. Try again.');
    }
  }

  return { open, signIn, signOut };
}
