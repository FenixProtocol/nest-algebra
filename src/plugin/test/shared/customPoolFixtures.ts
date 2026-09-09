import { getCreateAddress } from 'ethers';
import { ethers } from 'hardhat';

import {
  abi as POOL_DEPLOYER_ABI,
  bytecode as POOL_DEPLOYER_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json';
import {
  abi as ENTRY_POINT_ABI,
  bytecode as ENTRY_POINT_BYTECODE,
} from '@cryptoalgebra/integral-periphery/artifacts/contracts/AlgebraCustomPoolEntryPoint.sol/AlgebraCustomPoolEntryPoint.json';
import { AlgebraFactoryUpgradeable, AlgebraPoolDeployer } from '@cryptoalgebra/integral-core/typechain';
import { createEmptyFactoryProxy } from './externalFixtures';

export const TEST_ADDRESSES: [string, string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
  '0x3000000000000000000000000000000000000000',
];

export function sortAddresses(tokenA: string, tokenB: string): [string, string] {
  return BigInt(tokenA) < BigInt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
}

export async function customPoolEnvironmentFixture(): Promise<{
  factory: AlgebraFactoryUpgradeable;
  poolDeployer: AlgebraPoolDeployer;
  entryPoint: any;
}> {
  const [deployer] = await ethers.getSigners();
  const poolDeployerAddress = getCreateAddress({
    from: deployer.address,
    nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 4,
  });

  const factory = await createEmptyFactoryProxy();
  await factory.initialize(poolDeployerAddress, deployer.address);
  const poolDeployerFactory = await ethers.getContractFactory(POOL_DEPLOYER_ABI, POOL_DEPLOYER_BYTECODE);
  const poolDeployer = (await poolDeployerFactory.deploy(factory)) as any as AlgebraPoolDeployer;
  const entryPointFactory = await ethers.getContractFactory(ENTRY_POINT_ABI, ENTRY_POINT_BYTECODE);
  const entryPoint = await entryPointFactory.deploy(factory);

  await factory.grantRole(await factory.CUSTOM_POOL_DEPLOYER(), entryPoint);
  await factory.grantRole(await factory.POOLS_ADMINISTRATOR_ROLE(), entryPoint);
  return { factory, poolDeployer, entryPoint };
}
