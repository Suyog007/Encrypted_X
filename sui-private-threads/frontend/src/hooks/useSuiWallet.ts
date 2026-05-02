/**
 * Wallet hook – wraps @mysten/dapp-kit primitives into one convenient object.
 */

import {
  useCurrentWallet,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useDisconnectWallet,
  useConnectWallet,
  useWallets,
} from '@mysten/dapp-kit';

export function useSuiWallet() {
  const { currentWallet, connectionStatus } = useCurrentWallet();
  const currentAccount = useCurrentAccount();
  const client         = useSuiClient();

  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessage }        = useSignPersonalMessage();
  const { mutate:      disconnect }                 = useDisconnectWallet();
  const { mutate:      _connect }                   = useConnectWallet();
  const wallets                                     = useWallets();

  /** Connect to the first available wallet.  Shows the wallet-selection
   *  modal automatically if the user has multiple wallets installed. */
  const connect = () => {
    if (wallets.length > 0) {
      _connect({ wallet: wallets[0] });
    }
  };

  return {
    wallet:                    currentWallet,
    account:                   currentAccount,
    address:                   currentAccount?.address,
    isConnected:               connectionStatus === 'connected',
    connect,
    disconnect,
    /** Sign and broadcast a Transaction via the connected wallet. */
    signAndExecuteTransaction,
    /** Sign an arbitrary message for SEAL session-key creation. */
    signPersonalMessage,
    /** Read-only Sui RPC client (no signing). */
    client,
  };
}
