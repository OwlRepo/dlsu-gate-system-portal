import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface GateStatsState {
  allowed: number;
  allowedWithRemarks: number;
  notAllowed: number;
  setStats: (allowed: number, allowedWithRemarks: number, notAllowed: number) => void;
  resetStats: () => void;
}

export const useGateStatsStore = create<GateStatsState>()(
  persist(
    (set) => ({
      allowed: 0,
      allowedWithRemarks: 0,
      notAllowed: 0,
      setStats: (allowed, allowedWithRemarks, notAllowed) => 
        set({
          allowed,
          allowedWithRemarks,
          notAllowed,
        }),
      resetStats: () => 
        set({
          allowed: 0,
          allowedWithRemarks: 0,
          notAllowed: 0,
        }),
    }),
    {
      name: 'gate-stats',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        allowed: state.allowed,
        allowedWithRemarks: state.allowedWithRemarks,
        notAllowed: state.notAllowed,
      }),
    }
  )
);