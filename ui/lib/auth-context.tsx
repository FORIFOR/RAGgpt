"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type User = { email: string; name: string } | null;

type AuthContextType = {
  user: User;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function apiJson<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    credentials: "include",
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload as any)?.error ||
      (payload as any)?.detail ||
      (payload as any)?.message ||
      res.statusText;
    throw new Error(message);
  }
  return payload as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const me = await apiJson<User>("/api/auth/me");
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const me = await apiJson<User>("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(me);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const me = await apiJson<User>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    setUser(me);
  };

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" }).catch(() => {});
    setUser(null);
    router.push("/");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
