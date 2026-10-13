const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../../scripts/networksConfig');

const Q96 = 1n << 96n;

function getFactoryAddress(chainId) {
  if (process.env.FACTORY_ADDRESS) {
    return process.env.FACTORY_ADDRESS;
  }

  const config = getConfig(chainId);
  const deployDataPath = path.resolve(__dirname, '../../../../', config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  if (!deploysData.factory) {
    throw new Error(`Factory address is missing from ${deployDataPath}`);
  }

  return deploysData.factory;
}

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  const factoryAddress = getFactoryAddress(chainId);
  const [deployer] = await hre.ethers.getSigners();

  if (!deployer) {
    throw new Error('No deployer configured for this network');
  }

  const TokenFactory = await hre.ethers.getContractFactory('MockERC20');
  const tokenA = await TokenFactory.deploy('Mock Token A', 'MTA', 18);
  const tokenB = await TokenFactory.deploy('Mock Token B', 'MTB', 18);
  await Promise.all([tokenA.waitForDeployment(), tokenB.waitForDeployment()]);

  const tokenAAddress = await tokenA.getAddress();
  const tokenBAddress = await tokenB.getAddress();
  const [token0, token1] = BigInt(tokenAAddress) < BigInt(tokenBAddress) ? [tokenAAddress, tokenBAddress] : [tokenBAddress, tokenAAddress];

  const factory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', factoryAddress);
  const createPoolTx = await factory.createPool(token0, token1);
  await createPoolTx.wait();

  const poolAddress = await factory.poolByPair(token0, token1);
  const pool = await hre.ethers.getContractAt('AlgebraPool', poolAddress);
  const initializeTx = await pool.initialize(Q96);
  await initializeTx.wait();

  console.log('Mock token A:', tokenAAddress);
  console.log('Mock token B:', tokenBAddress);
  console.log('Token 0:', token0);
  console.log('Token 1:', token1);
  console.log('Pool:', poolAddress);
  console.log('Initial sqrt price (Q96):', Q96.toString());
  console.log('Anyone can mint tokens to themselves with mint(uint256)');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
