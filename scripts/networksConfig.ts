interface NetworkConfig {
  FILE: string;
}
const NetworksConfig: Record<number, NetworkConfig> = {};

export function getConfig(chainId: number): NetworkConfig {
  const config = NetworksConfig[chainId];
  if (!config) {
    throw Error('not supported chain, miss config: ' + chainId);
  }
  return config;
}
