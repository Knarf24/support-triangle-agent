import { createContext, useContext, useRef, useCallback } from "react";

type UnsavedDraftContextValue = {
  setDirty: (dirty: boolean) => void;
  isDirty: () => boolean;
};

const UnsavedDraftContext = createContext<UnsavedDraftContextValue>({
  setDirty: () => {},
  isDirty: () => false,
});

export function UnsavedDraftProvider({ children }: { children: React.ReactNode }) {
  const dirtyRef = useRef(false);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const isDirty = useCallback(() => dirtyRef.current, []);

  return (
    <UnsavedDraftContext.Provider value={{ setDirty, isDirty }}>
      {children}
    </UnsavedDraftContext.Provider>
  );
}

export function useUnsavedDraft() {
  return useContext(UnsavedDraftContext);
}
