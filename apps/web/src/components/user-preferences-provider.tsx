"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/lib/user-preferences";
import "./user-preferences.css";

const Context = createContext({
  preferences: DEFAULT_USER_PREFERENCES,
  userKey: "visitor",
  updatePreferences: (() => {}) as (preferences: UserPreferences) => void,
});

export function UserPreferencesProvider({
  initial,
  userKey,
  children,
}: {
  initial: UserPreferences;
  userKey: string;
  children: ReactNode;
}) {
  const initialKey = `${userKey}:${JSON.stringify(initial)}`;
  const [override, setOverride] = useState<{ key: string; value: UserPreferences } | null>(null);
  const preferences = override?.key === initialKey ? override.value : initial;
  useEffect(() => {
    document.documentElement.dataset.textSize = preferences.textSize;
    document.documentElement.dataset.reduceMotion = preferences.reduceMotion ? "true" : "false";
  }, [preferences.textSize, preferences.reduceMotion]);
  return (
    <Context.Provider
      key={userKey}
      value={{
        preferences,
        userKey,
        updatePreferences: (value) => setOverride({ key: initialKey, value }),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useUserPreferences() {
  return useContext(Context);
}
