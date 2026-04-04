'use client';

import { useState } from 'react';
import { SteamIcon } from '@/components/icons/SteamIcon';

export default function SteamConnectButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = () => {
    setIsLoading(true);
    window.location.href = '/api/steam/connect';
  };

  return (
    <button 
      onClick={handleConnect}
      disabled={isLoading}
      className="flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 px-6 rounded-2xl font-medium transition disabled:opacity-50"
    >
      <SteamIcon size={24} />
      {isLoading ? 'Collegamento...' : 'Collega Account Steam'}
    </button>
  );
}