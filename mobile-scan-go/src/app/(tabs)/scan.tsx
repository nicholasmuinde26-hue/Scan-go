import React, { useEffect, useState } from 'react';
import { guestStore } from '../../modules/guest/store';
import GuestShopScreen from '../../modules/guest/screens/GuestShopScreen';
import ScanScreen from '../../modules/basket/screens/ScanScreen';

/** Routes to the guest scanner when a guest pass is active, otherwise the
 *  registered-customer scan flow. */
export default function ScanTab() {
  const [isGuest, setIsGuest] = useState<boolean | null>(null);

  useEffect(() => {
    guestStore.isGuest().then(setIsGuest);
  }, []);

  if (isGuest === null) return null;
  return isGuest ? <GuestShopScreen /> : <ScanScreen />;
}
