import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, acceptTerms: boolean) => Promise<void>;
  acceptTerms: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  completePasswordReset: (token: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Loads the current session on mount (GET /api/auth/me) and exposes auth actions to the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const loggedInUser = await api.post<User>("/auth/login", { email, password });
    setUser(loggedInUser);
  }

  async function register(email: string, password: string, acceptTerms: boolean) {
    const newUser = await api.post<User>("/auth/register", { email, password, acceptTerms });
    setUser(newUser);
  }

  async function acceptTerms() {
    const updatedUser = await api.post<User>("/auth/accept-terms", {});
    setUser(updatedUser);
  }

  async function logout() {
    await api.post("/auth/logout", {});
    setUser(null);
  }

  async function completePasswordReset(token: string, newPassword: string) {
    const updatedUser = await api.post<User>("/auth/reset-password", { token, newPassword });
    setUser(updatedUser);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, acceptTerms, logout, setUser, completePasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Reads the current auth state; must be used within an AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
