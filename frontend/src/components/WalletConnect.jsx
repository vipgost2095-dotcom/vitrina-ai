import React from 'react';
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';

// Просто оборачиваем готовую кнопку TonConnect UI — она сама открывает список
// кошельков (Tonkeeper, Telegram Wallet и т.д.) и хранит состояние подключения.
export default function WalletConnect({ t }) {
  const address = useTonAddress();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-xl backdrop-blur">
      <TonConnectButton />
      {address ? (
        <p className="text-xs text-tg-hint">{t.walletHintConnected(`${address.slice(0, 4)}...${address.slice(-4)}`)}</p>
      ) : (
        <p className="text-center text-xs text-tg-hint">{t.walletHintNotConnected}</p>
      )}
    </div>
  );
}
