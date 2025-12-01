const hre = require('hardhat');
const path = require('path');

// Плагін
const PLUGIN_ARTIFACT = require('./AlgebraBasePluginV1.sol/AlgebraBasePluginV1.json');
const PLUGIN_ARTIFACT = require('./AlgebraBasePluginV1.sol/AlgebraBasePluginV1.json');

const { getConfig } = require('../../../scripts/networksConfig');


async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);

  const WHYPE_USDT0 = "0x20e6E73C91a29d21BdE672562a4B16649D66623E"
  {
    let typedPool = await hre.ethers.getContractAt("AlgebraPool", WHYPE_USDT0);
    let plugin = await typedPool.plugin();
    let pluginTyped = await hre.ethers.getContractAt(PLUGIN_ARTIFACT.abi, plugin);
    let tx = await pluginTyped.changeFeeConfiguration({
          alpha1: 500,
          alpha2: 1000,
          beta1: 300,
          beta2: 6000,
          gamma1: 50,
          gamma2: 1200,
          baseFee: 1000,
    });
    await tx.wait();
  }

  const WHYPE_UETH = "0x998007a512531d9081e116F85605C40d41Abd4f1"
  {
    let typedPool = await hre.ethers.getContractAt("AlgebraPool", WHYPE_UETH);
    let plugin = await typedPool.plugin();
    let pluginTyped = await hre.ethers.getContractAt(PLUGIN_ARTIFACT.abi, plugin);
    let tx = await pluginTyped.changeFeeConfiguration({
          alpha1: 800,
          alpha2: 900,
          beta1: 50,
          beta2: 5500,
          gamma1: 25,
          gamma2: 1200,
          baseFee: 1000,
    });
    await tx.wait();
  }

  const WHYPE_UBTC = "0xCd238eAfAdB112515910f8D09D94A90AC8C180Fe"
  {
    let typedPool = await hre.ethers.getContractAt("AlgebraPool", WHYPE_UBTC);
    let plugin = await typedPool.plugin();
    let pluginTyped = await hre.ethers.getContractAt(PLUGIN_ARTIFACT.abi, plugin);
    let feeConfig = await pluginTyped.feeConfig();

      let tx = await pluginTyped.changeFeeConfiguration({
          alpha1: 0,
          alpha2: 0,
          beta1: feeConfig.beta1,
          beta2: feeConfig.beta2,
          gamma1: feeConfig.gamma1,
          gamma2: feeConfig.gamma2,
          baseFee: 0.22e4,
      });
    await tx.wait();
  }

  const kHYPE_USDH = "0xC0578D20762FD5F4BA6F09124993709ffAa029aB";
  { 
    let typedPool = await hre.ethers.getContractAt("AlgebraPool", kHYPE_USDH);
    let plugin = await typedPool.plugin();
    let pluginTyped = await hre.ethers.getContractAt(PLUGIN_ARTIFACT.abi, plugin);
    let feeConfig = await pluginTyped.feeConfig();

      let tx = await pluginTyped.changeFeeConfiguration({
          alpha1: 0,
          alpha2: 0,
          beta1: feeConfig.beta1,
          beta2: feeConfig.beta2,
          gamma1: feeConfig.gamma1,
          gamma2: feeConfig.gamma2,
          baseFee: 0.22e4,
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
