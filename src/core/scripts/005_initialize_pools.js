const hre = require('hardhat');
const fs = require('fs');
const path = require('path');
const PLUGIN_ARTIFACT = require('./AlgebraBasePluginV1.sol/AlgebraBasePluginV1.json');

const { getConfig } = require('../../../scripts/networksConfig');
const { type } = require('os');
async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  let Config = getConfig(chainId);

  const deployDataPath = path.resolve(__dirname, '../../../' + Config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  let WHYPE = "0x5555555555555555555555555555555555555555";
  let USDT0 = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb";
  let UETH = "0xBe6727B535545C67d5cAa73dEa54865B92CF7907";
  let UBTC = "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463";
  let kHYPE = "0xfD739d4e423301CE9385c1fb8850539D657C296D";
  let UPUMP = "0x27eC642013bcB3D80CA3706599D3cdA04F6f4452"
  let USDH = "0x111111a1a0667d36bD57c0A9f569b98057111111";
  let USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";

  const AlgebraFactory = await hre.ethers.getContractAt('AlgebraFactoryUpgradeable', deploysData.factory);
  
  
// [WHYPE-USDT0] Pool already exists at 0x20e6E73C91a29d21BdE672562a4B16649D66623E, skipping createPool
// [WHYPE-USDT0] Final pool address: 0x20e6E73C91a29d21BdE672562a4B16649D66623E
// --------------------------------------------------
// [WHYPE-UETH] Pool already exists at 0x998007a512531d9081e116F85605C40d41Abd4f1, skipping createPool
// [WHYPE-UETH] Final pool address: 0x998007a512531d9081e116F85605C40d41Abd4f1
// --------------------------------------------------
// [WHYPE-UBTC] Pool already exists at 0xCd238eAfAdB112515910f8D09D94A90AC8C180Fe, skipping createPool
// [WHYPE-UBTC] Final pool address: 0xCd238eAfAdB112515910f8D09D94A90AC8C180Fe
// --------------------------------------------------
// [WHYPE-UPUMP] Pool already exists at 0xcE17208bDa21f2d84E1A410f8704ac56038a179d, skipping createPool
// [WHYPE-UPUMP] Final pool address: 0xcE17208bDa21f2d84E1A410f8704ac56038a179d
// --------------------------------------------------
// [kHYPE-USDH] Pool already exists at 0xC0578D20762FD5F4BA6F09124993709ffAa029aB, skipping createPool
// [kHYPE-USDH] Final pool address: 0xC0578D20762FD5F4BA6F09124993709ffAa029aB
// --------------------------------------------------
// [kHYPE-WHYPE] Pool already exists at 0xA83D60b1a9CA6Dd1d0D2d9275c700114F2F3a8d6, skipping createPool
// [kHYPE-WHYPE] Final pool address: 0xA83D60b1a9CA6Dd1d0D2d9275c700114F2F3a8d6
// --------------------------------------------------
// [WHYPE-USDH] Pool already exists at 0x45FbF9786cDBDE9E940620F4Af0eb42B76848d17, skipping createPool
// [WHYPE-USDH] Final pool address: 0x45FbF9786cDBDE9E940620F4Af0eb42B76848d17
// --------------------------------------------------
// [USDH-USDT0] Pool already exists at 0xb09a299E9f7D333420d347EEBE0456Cb0f8545d5, skipping createPool
// [USDH-USDT0] Final pool address: 0xb09a299E9f7D333420d347EEBE0456Cb0f8545d5
// --------------------------------------------------
// [USDH-USDC] Pool already exists at 0xc08fEc05f656690E2658EF8082F909E8d6EDC727, skipping createPool
// [USDH-USDC] Final pool address: 0xc08fEc05f656690E2658EF8082F909E8d6EDC727
// --------------------------------------------------
  const pairs = [
    ['WHYPE-USDT0', WHYPE, USDT0, "495636468372955326965388", 10n, 0.1e4],
    ['WHYPE-UETH',  WHYPE, UETH, "8821373321405790891351278881", 5n, 0.15e4],
    ['WHYPE-UBTC',  WHYPE, UBTC, "16200996169029282985070", 5n, 0.15e4],
    ['WHYPE-UPUMP', WHYPE, UPUMP, "714614041148765528372691726650663", 50n, 0.25e4],
    ['kHYPE-USDH',  kHYPE, USDH, "12654359712195301195602427786128022", 10n, 0.25e4],
    ['kHYPE-WHYPE', kHYPE, WHYPE, "79047628369227806803799553742", 1n, 0.005e4],
    ['WHYPE-USDH',  WHYPE, USDH, "12687170211802350829082029102368532", 10n, 0.1e4],
    ['USDH-USDT0',  USDH,  USDT0, "79253345673609279319744059764", 1n, 0.002e4],
    ['USDH-USDC',   USDH,  USDC, "79229901358118123593641909142", 1n, 0.002e4],
  ];

  for (const [label, token0, token1, initialPrice, tickSpacing, baseFee] of pairs) {
    const poolCurrentAddr = await AlgebraFactory.poolByPair(token0, token1);

    if (poolCurrentAddr === hre.ethers.ZeroAddress) {
      console.log(`[${label}] Pool does not exist yet. Creating...`);

      const tx = await AlgebraFactory.createPool(token0, token1);
      console.log(`[${label}] createPool tx sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(
        `[${label}] Pool created in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed.toString()})`
      );
    } else {
      console.log(
        `[${label}] Pool already exists at ${poolCurrentAddr}, skipping createPool`
      );
    }

    const pool = await AlgebraFactory.poolByPair(token0, token1);
    console.log(`[${label}] Final pool address: ${pool}`);
    console.log('--------------------------------------------------');
    let typedPool = await hre.ethers.getContractAt("AlgebraPool", pool);

    let state = await typedPool.globalState();
    if(state.price == 0n) {
        console.log(
          `[${label}] \t call initialize pools initialPrice:${initialPrice} ...`
        )
        let tx =  await typedPool.initialize(initialPrice);
        await tx.wait();
    } else {
        console.log(
          `[${label}] \tPool already initialized, current price: ${state.price}`
        )
    }

    if(await typedPool.tickSpacing() != tickSpacing) {
        console.log(
          `[${label}] \t Tick spacing try setup tickSpacing:${tickSpacing}`
        )
        let tx =  await typedPool.setTickSpacing(tickSpacing);
        await tx.wait();
    } else {
        console.log(
          `[${label}] \ Tick spacing already setuped to: ${tickSpacing}`
        )
    }

    let plugin = await typedPool.plugin();
    let pluginTyped = await hre.ethers.getContractAt(PLUGIN_ARTIFACT.abi, plugin);

    let feeConfig = await pluginTyped.feeConfig();

    const baseFeeBn = BigInt(baseFee);

    if(feeConfig.alpha1 != 0n && feeConfig.baseFee != baseFeeBn ) {
      let tx = await pluginTyped.changeFeeConfiguration({
          alpha1: 0,
          alpha2: 0,
          beta1: feeConfig.beta1,
          beta2: feeConfig.beta2,
          gamma1: feeConfig.gamma1,
          gamma2: feeConfig.gamma2,
          baseFee: baseFeeBn,
      });
      await tx.wait();
    }
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
