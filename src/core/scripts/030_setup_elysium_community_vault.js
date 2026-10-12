const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');

const ELYSIUM_TESTNET_CHAIN_ID = 99801n;
const COMMUNITY_VAULT_FACTORY = '0xc0cCb9144B49A594BEe6b9aDF9Aa6FB9F71759D9'; // the FeeVault contract from nest-core
const COMMUNITY_FEE = 100; // 10% of collected fees, expressed in thousandths.

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  if (chainId !== ELYSIUM_TESTNET_CHAIN_ID) {
    throw new Error(`This script can only run on Elysium testnet (${ELYSIUM_TESTNET_CHAIN_ID}); connected to ${chainId}`);
  }

  const config = getConfig(chainId);
  const deployDataPath = path.resolve(__dirname, '../../../', config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));
  if (!deploysData.factory) throw new Error(`Factory address is missing from ${deployDataPath}`);

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error('No signer configured for Elysium testnet');

  const factory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory, signer);
  const factoryOwner = await factory.owner();
  if (hre.ethers.getAddress(factoryOwner) !== hre.ethers.getAddress(signer.address)) {
    throw new Error(`Configured signer ${signer.address} is not the factory owner ${factoryOwner}`);
  }

  if ((await hre.ethers.provider.getCode(COMMUNITY_VAULT_FACTORY)) === '0x') {
    throw new Error(`Community vault factory has no bytecode: ${COMMUNITY_VAULT_FACTORY}`);
  }

  const currentVaultFactory = await factory.vaultFactory();
  if (hre.ethers.getAddress(currentVaultFactory) !== hre.ethers.getAddress(COMMUNITY_VAULT_FACTORY)) {
    const setVaultFactoryTx = await factory.setVaultFactory(COMMUNITY_VAULT_FACTORY);
    await setVaultFactoryTx.wait();
    console.log('Community vault factory set to', COMMUNITY_VAULT_FACTORY);
  } else {
    console.log('Community vault factory is already set to', COMMUNITY_VAULT_FACTORY);
  }

  const currentCommunityFee = await factory.defaultCommunityFee();
  if (currentCommunityFee !== BigInt(COMMUNITY_FEE)) {
    const setCommunityFeeTx = await factory.setDefaultCommunityFee(COMMUNITY_FEE);
    await setCommunityFeeTx.wait();
    console.log('Default community fee set to 10%');
  } else {
    console.log('Default community fee is already set to 10%');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
