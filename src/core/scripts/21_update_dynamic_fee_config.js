const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');
const PLUGIN_FACTORY_ARTIFACT = require('./BasePluginV1Factory.sol/BasePluginV1Factory.json');
const NEW_PLUGIN_ARTIFACT = require('./AlgebraDefaultPlugin.sol/AlgebraDefaultPlugin.json');

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);
  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let WHYPE = "0x5555555555555555555555555555555555555555";
  let USDT0 = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb";

  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);

  const pool = await AlgebraFactory.poolByPair(WHYPE, USDT0);

  const poolTyped = await hre.ethers.getContractAt("AlgebraPool", pool);

  const plugin = await poolTyped.plugin();

  let newPlugin = await hre.ethers.getContractAtFromArtifact(NEW_PLUGIN_ARTIFACT, plugin);
  await newPlugin.changeFeeConfiguration({
          alpha1: 400,
          alpha2: 600,
          beta1: 200,
          beta2: 5000,
          gamma1: 80,
          gamma2: 1000,
          baseFee: 800,
  });
  
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
