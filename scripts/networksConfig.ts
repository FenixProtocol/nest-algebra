interface NetworkConfig {
  FILE: string;
  WETH: string;
}
const NetworksConfig: Record<number, NetworkConfig> = {
  999: {
    FILE: 'hyper_evm_deploy.json',
    WETH: '0x5555555555555555555555555555555555555555',
  },
  998: {
    FILE: 'hyper_evm_testnet_deploy.json',
    WETH: '0xADcb2f358Eae6492F61A5F87eb8893d09391d160',
  },
  84532: {
    FILE: 'sepolia_base.json',
    WETH: '0x4200000000000000000000000000000000000006',
  },
};

export function getConfig(chainId: number): NetworkConfig {
  const config = NetworksConfig[chainId];
  if (!config) {
    throw Error('not supported chain, miss config: ' + chainId);
  }
  return config;
}
