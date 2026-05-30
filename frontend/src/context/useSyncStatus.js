// Separate file so Vite Fast Refresh works (no mixed hook+component exports).
import { useContext } from 'react';
import { SyncContext } from './SyncContext';

export function useSyncStatus() {
  return useContext(SyncContext);
}
