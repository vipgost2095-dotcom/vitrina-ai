import React from 'react';
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';

// Просто оборачиваем готовую кнопку TonConnect UI — она сама открывает список
// кошельков (Tonkeeper, Telegram Wallet и т.д.) и хранит состояние подключения.
export default function WalletConnect() {
  const address = useTonAddress();

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <TonConnectButton />
      {address ? (
        <p className="text-xs text-tg-hint">
          Подключён кошелёк: {address.slice(0, 4)}...{address.slice(-4)}
        </p>
      ) : (
        <p className="text-sm text-tg-hint">
          Подключите TON-кошелёк, если хотите платить TON или USDT (для Stars не нужно)
        </p>
      )}
    </div>
  );
}
