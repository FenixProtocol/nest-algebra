const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');
const PLUGIN_FACTORY_ARTIFACT = require('./BasePluginV1Factory.sol/BasePluginV1Factory.json');
const NEW_PLUGIN_ARTIFACT = require('./AlgebraDefaultPlugin.sol/AlgebraDefaultPlugin.json');
const OLD_PLUGIN_ARTIFACT = require('./AlgebraBasePluginV1.sol/AlgebraBasePluginV1.json');



async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);
  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let bbHLP = "0x4bB19336C973506B9405Db586b7AEE302a7CbCFc";
  let USDH = "0x111111a1a0667d36bD57c0A9f569b98057111111";

  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);
  const pairs = [
    ['USDH-bbHLP', USDH, bbHLP],
  ];
  
  let pluginFactory = await hre.ethers.getContractAtFromArtifact(PLUGIN_FACTORY_ARTIFACT, "0xe165ee23a9de18f7287DDE6e1C57737a6b1634Ad")
  
  for (const [label, token0, token1] of pairs) {
    let tx = await pluginFactory.createPluginForExistingPool(token0, token1);
    await tx.wait();
  }

  for (const [label, token0, token1] of pairs) {
    console.log("try setup for:", label)

    let poolAddr = await AlgebraFactory.poolByPair(token0, token1);
    let pool = await hre.ethers.getContractAt("AlgebraPool", poolAddr);
    let oldPluginAddress = await pool.plugin();
    let oldPlugin = await hre.ethers.getContractAtFromArtifact(OLD_PLUGIN_ARTIFACT, oldPluginAddress);

    let newPluginAddr = await pluginFactory.pluginByPool(poolAddr)
    let newPlugin = await hre.ethers.getContractAtFromArtifact(NEW_PLUGIN_ARTIFACT, newPluginAddr);
    
    let oldFee = await oldPlugin.feeConfig();

    console.log("Setup plugin for: ", label, " new plugin ", newPluginAddr)
    let tx = await pool.setPlugin(newPluginAddr);
    await tx.wait();

    console.log("Setup plugin config: ", label, " new plugin config ", 215)
    tx = await pool.setPluginConfig(215);
    await tx.wait();

    console.log("Initialize plugin", label)
    tx = await newPlugin.initialize();
    await tx.wait();

    console.log("Setup fee configuration", label)
    tx = await newPlugin.changeFeeConfiguration({
          alpha1: oldFee.alpha1,
          alpha2: oldFee.alpha2,
          beta1: oldFee.beta1,
          beta2: oldFee.beta2,
          gamma1: oldFee.gamma1,
          gamma2: oldFee.gamma2,
          baseFee: oldFee.baseFee,
      });
    await tx.wait();

  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
