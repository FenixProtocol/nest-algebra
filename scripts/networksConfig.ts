interface NetworkConfig {
  FILE: string;
  WETH: string;
  NATIVE_SYMBOL: string;
}
const NetworksConfig: Record<number, NetworkConfig> = {
  999: {
    FILE: 'hyper_evm_deploy.json',
    WETH: '0x5555555555555555555555555555555555555555',
    NATIVE_SYMBOL: 'HYPE',
  },
  998: {
    FILE: 'hyper_evm_testnet_deploy.json',
    WETH: '0xADcb2f358Eae6492F61A5F87eb8893d09391d160',
    NATIVE_SYMBOL: 'HYPE',
  },
  84532: {
    FILE: 'sepolia_base.json',
    WETH: '0x4200000000000000000000000000000000000006',
    NATIVE_SYMBOL: 'ETH',
  },
  99801: {
    FILE: 'elysium_testnet_deploy.json',
    WETH: '0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234',
    NATIVE_SYMBOL: 'HYPE',
  },
};

export function getConfig(chainId: number | bigint): NetworkConfig {
  const config = NetworksConfig[Number(chainId)];
  if (!config) {
    throw Error('not supported chain, miss config: ' + chainId);
  }
  return config;
}
