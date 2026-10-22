import { useEffect, useState } from "react";
import * as API from "../api.js";

// Keeps track of who is signed in. Roles: "user", "editor", "admin".
export function useAuth() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(API.hasToken());

  useEffect(() => {
    if (!API.hasToken()) return;
    API.getMe()
      .then(setUser)
      .catch(() => API.setToken(null)) // token expired (e.g. server restarted)
      .finally(() => setChecking(false));
  }, []);

  const finish = ({ token, user }) => { API.setToken(token); setUser(user); return user; };

  return {
    user,
    checking,
    signIn: (email, password) => API.login(email, password).then(finish),
    signUp: (name, email, password) => API.register(name, email, password).then(finish),
    signOut: async () => {
      try { await API.logout(); } catch { /* already signed out */ }
      API.setToken(null);
      setUser(null);
    },
    can: (...roles) => Boolean(user && roles.includes(user.role)),
  };
}
