import React from 'react';
import { ShoppingBag, Clock, MapPin, LifeBuoy, User } from 'lucide-react';
import { CustomerSection } from './customerTypes.js';
import { GetTheAppButton } from '../../components/GetTheAppButton';

interface Props {
  activeSection: CustomerSection;
  setActiveSection: (section: CustomerSection) => void;
  cartCount: number;
  attentionCount: number; // orders needing the customer's reply
}

const TABS: { id: CustomerSection; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'SHOP', label: 'Shop', Icon: ShoppingBag },
  { id: 'ORDERS', label: 'My Orders', Icon: Clock },
  { id: 'STORES', label: 'Stores', Icon: MapPin },
  { id: 'SUPPORT', label: 'Help', Icon: LifeBuoy },
  { id: 'ACCOUNT', label: 'Account', Icon: User },
];

export const CustomerTopBar: React.FC<Props> = ({ activeSection, setActiveSection, cartCount, attentionCount }) => (
  <nav
    aria-label="Customer sections"
    className="bg-white border border-slate-200 rounded-2xl p-1.5 shadow-xs flex gap-1 overflow-x-auto"
  >
    {TABS.map(({ id, label, Icon }) => {
      const active = activeSection === id;
      const badge = id === 'SHOP' ? cartCount : id === 'ORDERS' ? attentionCount : 0;
      return (
        <button
          key={id}
          onClick={() => setActiveSection(id)}
          aria-current={active ? 'page' : undefined}
          className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
            active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
          {badge > 0 && (
            <span
              className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
                active ? 'bg-white text-brand-700' : id === 'ORDERS' ? 'bg-rose-500 text-white' : 'bg-brand-600 text-white'
              }`}
            >
              {badge}
            </span>
          )}
        </button>
      );
    })}
    <GetTheAppButton className="ml-auto" />
  </nav>
);