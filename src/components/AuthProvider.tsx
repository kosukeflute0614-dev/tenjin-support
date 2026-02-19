'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    onAuthStateChanged,
    User,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { AppUser } from '@/types';
import { ensureUserTroupe } from '@/lib/platform';

interface AuthContextType {
    user: User | null;
    profile: AppUser | null;
    loading: boolean;
    isNewUser: boolean;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [isNewUser, setIsNewUser] = useState(false);

    const fetchProfile = async (uid: string) => {
        const docRef = doc(db, 'users', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const profileData = docSnap.data() as AppUser;
            setProfile(profileData);
            setIsNewUser(false);

            // Phase 1-B: 劇団データの自動生成（裏側のみ）
            ensureUserTroupe(uid, profileData);
        } else {
            setProfile(null);
            setIsNewUser(true);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user);
            if (user) {
                await fetchProfile(user.uid);
            } else {
                setProfile(null);
                setIsNewUser(false);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const refreshProfile = async () => {
        if (user) {
            await fetchProfile(user.uid);
        }
    };

    const loginWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Google login failed:", error);
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, isNewUser, loginWithGoogle, logout, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
