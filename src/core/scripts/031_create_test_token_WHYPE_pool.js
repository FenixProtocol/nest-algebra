const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');

const ELYSIUM_TESTNET_CHAIN_ID = 99801n;
const TEST_TOKEN_ADDRESS = '0x71a676b41569D2C3B19a3F182b1FAEb0a06dA3ff';
const Q96 = 1n << 96n;

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  if (chainId !== ELYSIUM_TESTNET_CHAIN_ID) {
    throw new Error(`This script can only run on Elysium testnet (${ELYSIUM_TESTNET_CHAIN_ID}); connected to ${chainId}`);
  }

  const testToken = hre.ethers.getAddress(TEST_TOKEN_ADDRESS);
  const config = getConfig(chainId);
  const whype = hre.ethers.getAddress(config.WETH);
  const deployDataPath = path.resolve(__dirname, '../../../', config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  if (!deploysData.factory) {
    throw new Error(`Factory address is missing from ${deployDataPath}`);
  }
  if (testToken === whype) {
    throw new Error('Test token must be different from WHYPE');
  }
  if ((await hre.ethers.provider.getCode(testToken)) === '0x') {
    throw new Error(`Test token has no bytecode: ${testToken}`);
  }

  const [signer] = await hre.ethers.getSigners();
  if (!signer) {
    throw new Error('No signer configured for Elysium testnet');
  }

  const factory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory, signer);
  let poolAddress = await factory.poolByPair(testToken, whype);

  if (poolAddress === hre.ethers.ZeroAddress) {
    const createPoolTx = await factory.createPool(testToken, whype);
    await createPoolTx.wait();
    poolAddress = await factory.poolByPair(testToken, whype);
    console.log('Pool created:', poolAddress);
  } else {
    console.log('Pool already exists:', poolAddress);
  }

  const pool = await hre.ethers.getContractAt('AlgebraPool', poolAddress, signer);
  const state = await pool.globalState();

  if (state.price === 0n) {
    const initializeTx = await pool.initialize(Q96);
    await initializeTx.wait();
    console.log('Pool initialized at a 1:1 price');
  } else {
    console.log('Pool already initialized with sqrt price:', state.price.toString());
  }

  const [token0, token1] = BigInt(testToken) < BigInt(whype) ? [testToken, whype] : [whype, testToken];
  console.log('Token 0:', token0);
  console.log('Token 1:', token1);
  console.log('Pool:', poolAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
