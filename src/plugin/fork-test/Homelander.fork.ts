// Homelander backruns on live Nest pools, on a fork of HyperEVM.
//
//   anvil --fork-url <HyperEVM RPC> --chain-id 999 --auto-impersonate --gas-limit 30000000 --block-base-fee-per-gas 0
//   FORK_URL=http://127.0.0.1:8545 npx hardhat test fork-test/Homelander.fork.ts --network hyperevmFork
//
// The Nest plugins and factories are deployed on the fork from this repository and attached to live pools.
// The Homelander router, executor, profit distributor and registry are the ones deployed on HyperEVM.
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Contract, Interface, JsonRpcProvider, JsonRpcSigner } from 'ethers';

const ALGEBRA_FACTORY = '0xF77Bd082c627aA54591cF2f2EaA811fd1AB3b1F3';
const NEST_SAFE = '0x6652173b0Cb3d96d8f0198bc49670440Dec69e79';

const HOMELANDER = {
  router: '0x4285f964DadF50b5c9E782A1A6FA6D84a9b2f028',
  executor: '0xC3206801b047baf2e9d3520974296f885c624228',
  distributor: '0x9de88385a8f47a74a873D13fFC447B1B37db793A',
  registry: '0x6bf1b372E6ED97df6B3236b82b6f6BAD401Ec26f',
  registryOwner: '0x000000000901403fe289d44bfC760BA39C28964a',
};

const CASES = [
  { name: 'NestTWAPFeePlugin', factory: 'NestTWAPFeePluginFactory', pool: '0xcd238eafadb112515910f8d09d94a90ac8c180fe', pair: 'WHYPE/UBTC' },
  { name: 'NestMEVFeePlugin', factory: 'NestMEVFeePluginFactory', pool: '0xbe512f5881b85c48d9c17bc5bb2be047d156d696', pair: 'WHYPE/USDC' },
];

const PRICE_MOVE = 0.01;

const POOL_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function plugin() view returns (address)',
  'function setPlugin(address)',
  'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
  'event Fee(uint16 fee)',
];
const poolIface = new Interface(POOL_ABI);
const distributorIface = new Interface([
  'event ProfitDistributed(address plugin, bytes32 indexed configId, address token, address swapRecipient, uint256 amount)',
]);

function signer(address: string) {
  return new JsonRpcSigner(new JsonRpcProvider((network.config as any).url, undefined, { staticNetwork: true }), address);
}

async function callFrames(hash: string): Promise<any[]> {
  const out: any[] = [];
  const walk = (c: any) => {
    out.push(c);
    (c.calls ?? []).forEach(walk);
  };
  walk(await network.provider.send('debug_traceTransaction', [hash, { tracer: 'callTracer' }]));
  return out;
}

async function deal(token: string, to: string, amount: bigint) {
  const erc20 = new Contract(token, ['function balanceOf(address) view returns (uint256)'], ethers.provider);
  const data = erc20.interface.encodeFunctionData('balanceOf', [to]);
  const trace = await network.provider.send('debug_traceCall', [{ to: token, data }, 'latest', { disableMemory: true, disableStorage: true }]);
  const slots = new Map<string, string>();
  const frames: string[] = [token.toLowerCase()];
  for (const log of trace.structLogs ?? []) {
    frames.length = log.depth;
    if (log.op === 'SLOAD') slots.set(log.stack[log.stack.length - 1], frames[log.depth - 1]);
    if (['CALL', 'STATICCALL'].includes(log.op)) frames[log.depth] = '0x' + log.stack[log.stack.length - 2].slice(-40);
    if (['DELEGATECALL', 'CALLCODE'].includes(log.op)) frames[log.depth] = frames[log.depth - 1];
  }
  const value = ethers.toBeHex(amount, 32);
  for (const [slot, holder] of [...slots.entries()].reverse()) {
    const key = ethers.toBeHex(BigInt('0x' + slot.replace(/^0x/, '')), 32);
    const old = await ethers.provider.getStorage(holder, key);
    await network.provider.send('anvil_setStorageAt', [holder, key, value]);
    if ((await erc20.balanceOf(to)) === amount) return;
    await network.provider.send('anvil_setStorageAt', [holder, key, old]);
  }
  throw new Error(`no balance slot for ${token}`);
}

describe('Homelander backruns in the Nest fee plugins (HyperEVM fork)', function () {
  this.timeout(1_800_000);

  let snapshot: string;
  let swapper: Contract;
  const safe = signer(NEST_SAFE);
  const registryOwner = signer(HOMELANDER.registryOwner);

  async function swapMove(pool: string, zeroToOne: boolean, gasLimit = 2_900_000) {
    const c = new Contract(pool, POOL_ABI, ethers.provider);
    await deal(zeroToOne ? await c.token0() : await c.token1(), await swapper.getAddress(), 10n ** 32n);
    const price: bigint = (await c.globalState()).price;
    const factor = Math.sqrt(zeroToOne ? 1 - PRICE_MOVE : 1 + PRICE_MOVE);
    const limit = (price * BigInt(Math.round(factor * 1e9))) / 1_000_000_000n;
    const tx = await swapper.swapToPrice(pool, zeroToOne, 10n ** 31n, limit, { gasLimit });
    const receipt = await tx.wait().catch((e: any) => e.receipt);
    if (receipt.status !== 1 && process.env.TRACE)
      for (const f of await callFrames(tx.hash))
        if (f.error)
          console.log(`        ${f.type} ${f.from?.slice(0, 10)}→${f.to?.slice(0, 10)} ${f.input?.slice(0, 10)} gas ${parseInt(f.gas ?? '0', 16)} used ${parseInt(f.gasUsed ?? '0', 16)} ${f.error} ${f.revertReason ?? ''} out ${(f.output ?? '').slice(0, 140)}`);
    return { tx, receipt };
  }

  before(async () => {
    for (const a of [NEST_SAFE, HOMELANDER.registryOwner]) await network.provider.send('anvil_setBalance', [a, '0x56BC75E2D63100000']);
    await network.provider.send('evm_setBlockGasLimit', ['0x1c9c380']);
    await network.provider.send('anvil_setBlockTimestampInterval', [1]);
    snapshot = await network.provider.send('evm_snapshot', []);
    swapper = (await (await ethers.getContractFactory('ForkSwapper')).deploy()) as any;
  });

  after(async () => {
    await network.provider.send('evm_revert', [snapshot]);
    await network.provider.send('anvil_removeBlockTimestampInterval', []);
  });

  for (const c of CASES) {
    describe(`${c.name} on ${c.pair}`, () => {
      let plugin: Contract;
      let caseSnapshot: string;
      const backrunGas: Record<string, bigint> = {};

      before(async () => {
        caseSnapshot = await network.provider.send('evm_snapshot', []);
        const implementation = await (await ethers.getContractFactory(c.name)).deploy();
        // The custom-pool entry point is not used by existing pools; any contract satisfies the constructor check
        const factory = (await (await ethers.getContractFactory(c.factory)).deploy(ALGEBRA_FACTORY, ALGEBRA_FACTORY, await implementation.getAddress())) as any;
        await (await factory.connect(safe).setDefaultMevxConfig(HOMELANDER.router, HOMELANDER.executor, HOMELANDER.distributor, ethers.ZeroHash)).wait();

        const registry = new Contract(HOMELANDER.registry, ['function setApprovedFactory(address,bool)', 'function isPlugin(address) view returns (bool)'], registryOwner);
        await (await registry.setApprovedFactory(await factory.getAddress(), true)).wait();

        const pool = new Contract(c.pool, POOL_ABI, safe);
        await (await factory.connect(safe).createPluginForExistingPool(await pool.token0(), await pool.token1())).wait();
        plugin = await ethers.getContractAt(c.name, await factory.pluginByPool(c.pool));
        await (await pool.setPlugin(await plugin.getAddress())).wait();
        await (await (plugin.connect(safe) as any)['initialize()']()).wait();

        expect(await registry.isPlugin(await plugin.getAddress())).to.eq(true);
        expect(Number((await pool.globalState()).pluginConfig) & 2).to.eq(2, 'AFTER_SWAP enabled');
      });

      after(async () => {
        await network.provider.send('evm_revert', [caseSnapshot]);
      });

      for (const zeroToOne of [true, false]) {
        it(`a user swap moving the price by 1% (${zeroToOne ? '0→1' : '1→0'}) is backrun, the profit reaches the distributor and the pool fee is restored`, async () => {
          const id = await network.provider.send('evm_snapshot', []);
          const { tx, receipt } = await swapMove(c.pool, zeroToOne);
          expect(receipt.status).to.eq(1);

          const profits = receipt.logs
            .filter((l: any) => l.address.toLowerCase() === HOMELANDER.distributor.toLowerCase())
            .map((l: any) => distributorIface.parseLog(l))
            .filter((e: any) => e?.name === 'ProfitDistributed');
          const executor = HOMELANDER.executor.toLowerCase();
          const executorSwappedHere = (await callFrames(tx.hash)).some(
            (f) => f.from?.toLowerCase() === executor && f.to?.toLowerCase() === c.pool && f.input?.startsWith('0x128acb08')
          );
          const fees = receipt.logs
            .filter((l: any) => l.address.toLowerCase() === c.pool && l.topics[0] === poolIface.getEvent('Fee')!.topicHash)
            .map((l: any) => Number(poolIface.parseLog(l)!.args.fee));
          console.log(
            `      gas ${receipt.gasUsed}, profit ${profits.map((e: any) => `${e.args.amount} of ${e.args.token}`).join(', ') || '-'}, pool fee events ${fees.join(' → ') || '-'}`
          );

          expect(profits.length, 'backrun with profit').to.be.gt(0);
          backrunGas[String(zeroToOne)] = receipt.gasUsed;
          if (executorSwappedHere) {
            const zero = fees.lastIndexOf(0);
            expect(zero, 'executor swapped at zero fee').to.be.gte(0);
            expect(fees[zero + 1], 'pool fee restored').to.be.gt(0);
          }
          await network.provider.send('evm_revert', [id]);
        });
      }

      it('hard mode: a swap that starves the arbitrage of gas reverts, the same swap passes with hard mode off', async () => {
        const fullGas = backrunGas['true'];
        expect(fullGas !== undefined, 'backrun gas measured by the previous test').to.eq(true);
        const gasLimit = (fullGas * 6n) / 10n;

        const id2 = await network.provider.send('evm_snapshot', []);
        const off = await swapMove(c.pool, true, Number(gasLimit));
        expect(off.receipt.status).to.eq(1);
        await network.provider.send('evm_revert', [id2]);

        await (await (plugin.connect(safe) as any).setCallGasBudget(fullGas)).wait();
        await (await (plugin.connect(safe) as any).setHardMode(true)).wait();
        const starved = await swapMove(c.pool, true, Number(gasLimit));
        expect(starved.receipt.status).to.eq(0);
        expect((await swapMove(c.pool, true)).receipt.status).to.eq(1);
      });
    });
  }
});
