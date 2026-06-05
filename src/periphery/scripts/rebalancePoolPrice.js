const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../../../scripts/networksConfig');

const DEFAULT_POOL = '0x126df3f50c03c42b9dee3a40819c9daaec65cfe9';
const EXP_SENDER = '0xDcdff1C6721BE9c0E876f447C64d6d3689EbD132';
const MIN_TICK = -887272;
const MAX_TICK = 887272;
const MIN_SWAP_TOLERANCE_BPS = 10n; // 0.10% by sqrt price
const QUOTE_BUFFER_BPS = 50n; // +0.5% buffer over quoted amountIn

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

const FACTORY_ABI = ['function poolByPair(address tokenA, address tokenB) external view returns (address)'];
const POOL_ABI = [
  'function safelyGetStateOfAMM() external view returns (uint160 sqrtPrice, int24 tick, uint16, uint8, uint128, int24, int24)',
  'function tickSpacing() external view returns (int24)',
  'function liquidity() external view returns (uint128)',
];
const QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint160 limitSqrtPrice) params) external returns (uint256 amountOut,uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate,uint16 fee)',
];

// Fill params here and run script without CLI args.
const SCRIPT_PARAMS = {
  // Target sqrtPriceX96 directly (Q64.96)
  targetSqrtPriceX96: '27301805867923749565471224',
  // token1 (for example DEDCAT)
  token1Address: '0x5555555555555555555555555555555555555555',
  // token2 (for example WHYPE)
  token2Address: '0xc9972964EA38c6992Cc66c603E87292C1A891662',
  // Optional: set exact pool; if null then script uses DEFAULT_POOL
  poolAddress: "0x126DF3f50c03C42B9deE3a40819C9daaEc65cFe9",
  // Revert if one-swap rebalance cannot reach target with current input token balance
  revertIfTargetNotReachable: true,
};

function absDiff(a, b) {
  return a >= b ? a - b : b - a;
}

function roundDownToSpacing(tick, spacing) {
  const s = Number(spacing);
  return Math.floor(tick / s) * s;
}

function roundUpToSpacing(tick, spacing) {
  const s = Number(spacing);
  return Math.ceil(tick / s) * s;
}

async function ensureAllowance(token, owner, spender, amount) {
  const allowance = await token.allowance(owner, spender);
  if (allowance >= amount) return;
  const tx = await token.approve(spender, hre.ethers.MaxUint256);
  await tx.wait();
}

async function main() {
  const {
    targetSqrtPriceX96: targetSqrtPriceX96Raw,
    token1Address: token1Input,
    token2Address: token2Input,
    poolAddress: poolOverride,
  } = SCRIPT_PARAMS;

  if (
    token1Input === '0x0000000000000000000000000000000000000000' ||
    token2Input === '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error('Set token1Address and token2Address in SCRIPT_PARAMS before running');
  }

  if (!hre.ethers.isAddress(token1Input) || !hre.ethers.isAddress(token2Input)) {
    throw new Error('token1Address/token2Address must be valid addresses');
  }

  if (!/^\d+$/.test(targetSqrtPriceX96Raw)) {
    throw new Error('targetSqrtPriceX96 must be a positive integer string');
  }
  const targetSqrtPriceX96 = BigInt(targetSqrtPriceX96Raw);
  if (targetSqrtPriceX96 <= 0n) {
    throw new Error('targetSqrtPriceX96 must be > 0');
  }

  const { chainId } = await hre.ethers.provider.getNetwork();
  const config = getConfig(Number(chainId));
  const deployDataPath = path.resolve(__dirname, '../../../' + config.FILE);
  const deploysData = JSON.parse(fs.readFileSync(deployDataPath, 'utf8'));

  const [signer] = await hre.ethers.getSigners();
  const signerAddress = signer.address;
  if (signerAddress !== EXP_SENDER) {
    throw new Error('Signer address must be EXP_SENDER');
  }

  const factory = new hre.ethers.Contract(deploysData.factory, FACTORY_ABI, signer);
  const positionManager = await hre.ethers.getContractAt('INonfungiblePositionManager', deploysData.nonfungiblePositionManager);
  const router = await hre.ethers.getContractAt('ISwapRouter', deploysData.swapRouter);
  const quoterV2 = new hre.ethers.Contract(deploysData.quoterV2, QUOTER_V2_ABI, signer);

  const tokenA = hre.ethers.getAddress(token1Input);
  const tokenB = hre.ethers.getAddress(token2Input);
  const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
  const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;

  const token0Contract = new hre.ethers.Contract(token0, ERC20_ABI, signer);
  const token1Contract = new hre.ethers.Contract(token1, ERC20_ABI, signer);

  const [dec0, dec1, sym0, sym1] = await Promise.all([
    token0Contract.decimals(),
    token1Contract.decimals(),
    token0Contract.symbol(),
    token1Contract.symbol(),
  ]);

  const poolFromFactory = await factory.poolByPair(token0, token1);
  const poolAddress = poolOverride ? hre.ethers.getAddress(poolOverride) : DEFAULT_POOL;
  if (poolFromFactory === hre.ethers.ZeroAddress) {
    throw new Error('Pool does not exist in factory for provided token pair');
  }

  if (poolFromFactory.toLowerCase() !== poolAddress.toLowerCase()) {
    console.warn(`WARNING: provided pool differs from factory.poolByPair; using ${poolAddress}`);
    console.warn(`factory.poolByPair = ${poolFromFactory}`);
  }

  const pool = new hre.ethers.Contract(poolAddress, POOL_ABI, signer);
  const [currentSqrtPriceX96, currentTick] = await pool.safelyGetStateOfAMM().then((x) => [x[0], x[1]]);
  const tickSpacing = await pool.tickSpacing();

  console.log(`Signer: ${signerAddress}`);
  console.log(`Pool: ${poolAddress}`);
  console.log(`Tokens (token0/token1): ${sym0}/${sym1} (${token0}/${token1})`);
  console.log(`Current sqrtPriceX96: ${currentSqrtPriceX96.toString()} | tick=${currentTick}`);
  console.log(`Target  sqrtPriceX96: ${targetSqrtPriceX96.toString()}`);

  // 1) Add tiny full-range liquidity only if pool currently has zero in-range liquidity.
  const currentLiquidity = await pool.liquidity();
  if (currentLiquidity === 0n) {
    const tickLower = roundUpToSpacing(MIN_TICK, tickSpacing);
    const tickUpper = roundDownToSpacing(MAX_TICK, tickSpacing);

    const amount0Desired = hre.ethers.parseUnits('0.01', dec0);
    const amount1Desired = hre.ethers.parseUnits('0.01', dec1);

    const [bal0, bal1] = await Promise.all([token0Contract.balanceOf(signerAddress), token1Contract.balanceOf(signerAddress)]);
    if (bal0 < amount0Desired || bal1 < amount1Desired) {
      throw new Error(
        `Insufficient token balances for initial mint. Required: 0.01 ${sym0} and 0.01 ${sym1}; current: ${hre.ethers.formatUnits(
          bal0,
          dec0
        )} ${sym0}, ${hre.ethers.formatUnits(bal1, dec1)} ${sym1}`
      );
    }

    await ensureAllowance(token0Contract, signerAddress, deploysData.nonfungiblePositionManager, amount0Desired);
    await ensureAllowance(token1Contract, signerAddress, deploysData.nonfungiblePositionManager, amount1Desired);

    const mintTx = await positionManager.mint({
      token0,
      token1,
      tickLower,
      tickUpper,
      amount0Desired,
      amount1Desired,
      amount0Min: 0,
      amount1Min: 0,
      recipient: signerAddress,
      deadline: Math.floor(Date.now() / 1000) + 1200,
    });
    await mintTx.wait();
    console.log(`Small liquidity position minted in range [${tickLower}, ${tickUpper}]`);
  } else {
    console.log(`Skip mint: pool liquidity is non-zero (${currentLiquidity.toString()})`);
  }

  // 2) One-shot swap: quote required amountIn, then execute exactly one swap.
  await ensureAllowance(token0Contract, signerAddress, deploysData.swapRouter, hre.ethers.MaxUint256 / 2n);
  await ensureAllowance(token1Contract, signerAddress, deploysData.swapRouter, hre.ethers.MaxUint256 / 2n);

  const [sqrtPriceBeforeSwap] = await pool.safelyGetStateOfAMM();
  const current = BigInt(sqrtPriceBeforeSwap.toString());
  const diff = absDiff(current, targetSqrtPriceX96);

  if (diff * 10000n <= targetSqrtPriceX96 * MIN_SWAP_TOLERANCE_BPS) {
    console.log('Current pool price is already within tolerance; skip swap');
  } else {
    const needIncrease = current < targetSqrtPriceX96;
    const tokenIn = needIncrease ? token1Contract : token0Contract;
    const tokenOut = needIncrease ? token0Contract : token1Contract;
    const decIn = needIncrease ? dec1 : dec0;
    const symIn = needIncrease ? sym1 : sym0;
    const symOut = needIncrease ? sym0 : sym1;

    const balanceIn = await tokenIn.balanceOf(signerAddress);
    if (balanceIn === 0n) {
      throw new Error(`Cannot continue rebalance: zero ${symIn} balance for swap input`);
    }

    const quote = await quoterV2.quoteExactInputSingle.staticCall({
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      amountIn: balanceIn,
      limitSqrtPrice: targetSqrtPriceX96,
    });

    const quotedAmountIn = quote.amountIn;
    const quotedSqrtPriceAfter = BigInt(quote.sqrtPriceX96After.toString());
    const reachesTargetInQuote = quotedSqrtPriceAfter === targetSqrtPriceX96;

    if (SCRIPT_PARAMS.revertIfTargetNotReachable && !reachesTargetInQuote) {
      throw new Error(
        `Target not reachable with current ${symIn} balance. Quoted sqrt after max swap: ${quotedSqrtPriceAfter.toString()}, target: ${targetSqrtPriceX96.toString()}`
      );
    }

    let amountInForSwap = (quotedAmountIn * (10000n + QUOTE_BUFFER_BPS)) / 10000n;
    if (amountInForSwap > balanceIn) amountInForSwap = balanceIn;

    console.log(
      `Single swap: ${hre.ethers.formatUnits(amountInForSwap, decIn)} ${symIn} -> ${symOut} (quoted required ${hre.ethers.formatUnits(
        quotedAmountIn,
        decIn
      )})`
    );

    const swapTx = await router.exactInputSingle({
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      recipient: signerAddress,
      deadline: Math.floor(Date.now() / 1000) + 1200,
      amountIn: amountInForSwap,
      amountOutMinimum: 0,
      limitSqrtPrice: targetSqrtPriceX96,
    });
    await swapTx.wait();
  }

  const [finalSqrt, finalTick] = await pool.safelyGetStateOfAMM().then((x) => [x[0], x[1]]);
  console.log(`Final sqrtPriceX96: ${finalSqrt.toString()} | tick=${finalTick}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
