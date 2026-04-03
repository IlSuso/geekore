'use client';

import { useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SteamIcon } from '@/components/icons/SteamIcon';

export default function SteamConnectButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    console.log("=== PULSANTE STEAM CLICKED ===");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        alert("Devi essere loggato per collegare Steam");
        setIsLoading(false);
        return;
      }

      console.log("User ID trovato:", user.id);

      const callbackUrl = `${window.location.origin}/steam-callback?user_id=${user.id}`;

      const steamLoginUrl = `https://steamcommunity.com/openid/login?` +
        `openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select&` +
        `openid.identity=http://specs.openid.net/auth/2.0/identifier_select&` +
        `openid.mode=checkid_setup&` +
        `openid.ns=http://specs.openid.net/auth/2.0&` +
        `openid.realm=${encodeURIComponent(window.location.origin)}&` +
        `openid.return_to=${encodeURIComponent(callbackUrl)}`;

      console.log("Redirecting to Steam...");
      window.location.href = steamLoginUrl;

    } catch (e) {
      console.error("Errore:", e);
      alert("Errore durante il collegamento");
      setIsLoading(false);
    }
  };

  return (
    <button onClick={handleConnect} className="...">
  <SteamIcon size={24} className="mr-2" />
  Collega account Steam
</button>
  );
}