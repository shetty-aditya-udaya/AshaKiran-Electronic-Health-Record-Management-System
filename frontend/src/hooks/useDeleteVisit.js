/**
 * useDeleteVisit — shared hook for deleting a single visit.
 *
 * Strategy (offline-first):
 *  1. Delete from IDB immediately (UI reflects change at once)
 *  2. Dispatch 'visit-deleted' + 'local-data-written' events
 *  3. If the visit has a server id and network is reachable, call DELETE /api/visits/<id>
 *     404 from server = already gone, silently accepted.
 */
import { useCallback, useState } from 'react';
import { deleteVisitAndRelated } from '../lib/db';
import { api, NetworkError } from '../utils/apiClient';
import toast from 'react-hot-toast';
import { useConnection } from '../context/ConnectionContext';

export function useDeleteVisit({ onDeleted } = {}) {
  const [deleteTarget, setDeleteTarget] = useState(null);  // visit object to confirm
  const [isDeleting,   setIsDeleting]   = useState(false);
  const { isServerReachable } = useConnection();

  const requestDelete = useCallback((visit) => {
    setDeleteTarget(visit);
  }, []);

  const cancelDelete = useCallback(() => {
    if (!isDeleting) setDeleteTarget(null);
  }, [isDeleting]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    const localId  = deleteTarget.local_id;
    const serverId = deleteTarget.id;

    try {
      // 1. Purge from IDB instantly
      await deleteVisitAndRelated(localId, serverId);

      // 2. Notify all listeners
      window.dispatchEvent(new CustomEvent('visit-deleted'));
      window.dispatchEvent(new CustomEvent('local-data-written'));

      // 3. Delete on server (non-blocking — don't wait if offline)
      if (serverId && isServerReachable) {
        api.delete(`/api/visits/${serverId}`).catch(err => {
          if (err?.status !== 404) {
            console.warn('[useDeleteVisit] Server delete failed (IDB already cleaned):', err?.message);
          }
        });
      }

      toast.success('Visit deleted successfully.');
      onDeleted?.(deleteTarget);
    } catch (err) {
      console.error('[useDeleteVisit] IDB deletion failed:', err);
      toast.error('Failed to delete visit. Please try again.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleted]);

  return { deleteTarget, isDeleting, requestDelete, cancelDelete, confirmDelete };
}
