import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { apiRequest } from '../../api';

interface StoreInfo {
  _id: string;
  name: string;
  location: string;
  organizationId: string;
}

export const WorkspaceSwitcher: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStores = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/stores');
      setStores(res.stores || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchStores();
  }, [isOpen]);

  const handleSwitch = async (store: StoreInfo) => {
    try {
      await apiRequest('/act-as/request', {
        method: 'POST',
        body: JSON.stringify({
          targetOrganizationId: store.organizationId,
          targetStoreId: store._id,
          reason: 'Customer switched store',
          durationHours: 12,
        }),
      });
      alert(`Switched to ${store.name}`);
      localStorage.setItem('customerStoreId', store._id);
      setIsOpen(false);
      window.location.reload();
    } catch (e: any) {
      alert(e.message || 'Switch failed');
    }
  };

  return (
    <>
      <button
        className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
        onClick={() => setIsOpen(true)}
      >
        Switch Store
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-96 max-h-[80vh] overflow-auto p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Select a Store</h2>
              <button onClick={() => setIsOpen(false)} className="p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 className="animate-spin w-6 h-6 text-brand-600" />
              </div>
            )}
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <ul className="space-y-2">
              {stores.map((s) => (
                <li
                  key={s._id}
                  className="flex justify-between items-center p-2 border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => handleSwitch(s)}
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.location}</p>
                  </div>
                  <button className="px-2 py-1 text-xs bg-brand-600 text-white rounded">Select</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
};

export default WorkspaceSwitcher;
