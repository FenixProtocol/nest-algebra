const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

// Плагін
const PLUGIN_ARTIFACT = require('./AlgebraBasePluginV1.sol/AlgebraBasePluginV1.json');

const { getConfig } = require('../../../scripts/networksConfig');

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let WHYPE = "0x5555555555555555555555555555555555555555";
  let USDT0 = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb";
  let UETH  = "0xBe6727B535545C67d5cAa73dEa54865B92CF7907";
  let UBTC  = "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463";
  let kHYPE = "0xfD739d4e423301CE9385c1fb8850539D657C296D";
  let UPUMP = "0x27eC642013bcB3D80CA3706599D3cdA04F6f4452";
  let USDH  = "0x111111a1a0667d36bD57c0A9f569b98057111111";
  let USDC  = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";

  const AlgebraFactory = await hre.ethers.getContractAt(
    'AlgebraFactoryUpgradeable',
    deploysData.factory
  );

  const pairs = [
    ['WHYPE-USDT0', WHYPE, USDT0],
    ['WHYPE-UETH',  WHYPE, UETH],
    ['WHYPE-UBTC',  WHYPE, UBTC],
    ['WHYPE-UPUMP', WHYPE, UPUMP],
    ['kHYPE-USDH',  kHYPE, USDH],
    ['kHYPE-WHYPE', kHYPE, WHYPE],
    ['WHYPE-USDH',  WHYPE, USDH],
    ['USDH-USDT0',  USDH,  USDT0],
    ['USDH-USDC',   USDH,  USDC],
  ];

  for (const [label, token0, token1] of pairs) {
    const pool = await AlgebraFactory.poolByPair(token0, token1);

    if (pool === hre.ethers.ZeroAddress) {
      console.log(`[${label}] Pool does not exist`);
      console.log('--------------------------------------------------');
      continue;
    }

    const typedPool = await hre.ethers.getContractAt("AlgebraPool", pool);

    // token0 / token1 info
    const token0Contract = new hre.ethers.Contract(token0, ERC20_ABI, hre.ethers.provider);
    const token1Contract = new hre.ethers.Contract(token1, ERC20_ABI, hre.ethers.provider);

    const [token0Name, token1Name] = await Promise.all([
      token0Contract.name(),
      token1Contract.name(),
    ]);

    // state + tickSpacing
    const state = await typedPool.globalState();
    const tickSpacing = await typedPool.tickSpacing();

    // plugin + fee
    const pluginAddr = await typedPool.plugin();
    let feeValue = 'n/a';

    if (pluginAddr !== hre.ethers.ZeroAddress) {
      const pluginTyped = await hre.ethers.getContractAt(
        PLUGIN_ARTIFACT.abi,
        pluginAddr
      );
      try {
        const fee = await pluginTyped.getCurrentFee();
        feeValue = fee.toString();
      } catch (e) {
        feeValue = `error calling getFee(): ${e.message}`;
      }
    }

    console.log(`[${label}] (${pool}):`);
    console.log(`\t token0: ${token0Name} (${token0})`);
    console.log(`\t token1: ${token1Name} (${token1})`);
    console.log(`\t getFee(): ${feeValue}`);
    console.log(`\t tickSpacing: ${tickSpacing.toString()}`);
    console.log(`\t price: ${state.price.toString()}`);
    console.log(`\t tick: ${state.tick.toString()}`);
    console.log('--------------------------------------------------');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
