import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  signInWithPopup,
  signOut,
} from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  authError: string | null;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('blick_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('blick_theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (firebaseUser && firebaseUser.emailVerified) {
        const userPath = `users/${firebaseUser.uid}`;
        try {
          const ref = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(ref, {
              uid: firebaseUser.uid,
              displayName: (firebaseUser.displayName || 'Blick User').slice(0, 120),
              email: (firebaseUser.email || '').slice(0, 200),
              photoURL: (firebaseUser.photoURL || '').slice(0, 500),
              preferredModel: 'gemini-4-hydrogen',
              theme,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const data = snap.data();
            if (data?.theme === 'light' || data?.theme === 'dark') {
              setTheme(data.theme);
            }
            await updateDoc(ref, {
              displayName: (firebaseUser.displayName || data?.displayName || 'Blick User').slice(0, 120),
              photoURL: (firebaseUser.photoURL || data?.photoURL || '').slice(0, 500),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.warn('Profile sync warning:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const toggleTheme = async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (user && user.emailVerified) {
      const userPath = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          theme: nextTheme,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    }
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      setAuthError(msg);
    }
  };

  const logOut = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        authError,
        theme,
        toggleTheme,
        signInWithGoogle,
        logOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
