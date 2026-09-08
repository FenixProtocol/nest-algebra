// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

import './base/TimestampUpgradeable.sol';
import './interfaces/INestTWAPFeePlugin.sol';
import './interfaces/INestFeePluginFactory.sol';
import './interfaces/IAlgebraVirtualPool.sol';

import './libraries/VolatilityOracle.sol';

/// @title Nest self-TWAP fee plugin
/// @notice Independently deployable Nest MEV-resistant fee. Stores timepoints and computes a dynamic fee from the deviation
/// of the current tick from the pool's OWN TWAP:
/// fee = min(baseFee + scalingFactor * |tick - twapTick| / SCALING_PRECISION, feeCap)
/// @notice This mode is fully self-contained and has no external price dependency. NestMEVFeePlugin inherits
/// this implementation and adds the optional HyperCore spot-referenced fee term.
/// @dev The fee is recalculated on every swap, including swaps within the same block. The resulting
/// fee is charged to the complete swap at its pre-swap value.
/// Economic protection depends on liquidity, trade size, execution path and external-market costs;
/// the configured slope alone is not a profitability proof.
contract NestTWAPFeePlugin is INestTWAPFeePlugin, IAlgebraPlugin, Initializable, TimestampUpgradeable {
  using Plugins for uint8;

  uint256 internal constant UINT16_MODULO = 65536;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  /// @dev Dedicated role so fee control is separable from the shared base-plugin ops key. Grant in AlgebraFactory.
  bytes32 public constant DEVIATION_FEE_MANAGER = keccak256('DEVIATION_FEE_MANAGER');

  /// @notice scalingFactor / SCALING_PRECISION = fee units (1e-6) added per tick of deviation.
  /// One tick is approximately 1bp of price, or 100 fee units. A value of
  /// 100 * SCALING_PRECISION is therefore the normalized arithmetic slope benchmark; it is not
  /// an economic break-even claim for a complete trade.
  uint256 public constant SCALING_PRECISION = 1e6;
  /// @notice Maximum normalized slope is 1.0 (100 fee-units per raw tick).
  uint256 public constant MAX_SCALING_FACTOR = 100 * SCALING_PRECISION;
  uint16 public constant MAX_BASE_FEE = 30_000; // 3%
  uint16 public constant MAX_FEE_CAP = 50_000; // 5%
  uint32 public constant MIN_TWAP_WINDOW = 60; // 1 minute
  // Bounded to ~12h: the timepoint ring buffer (65535 slots, written <=1/sec) cannot guarantee a full
  // day of history on a busy pool, so a >12h window could silently disable the dynamic fee.
  uint32 public constant MAX_TWAP_WINDOW = 12 hours;

  /// @inheritdoc IAlgebraPlugin
  uint8 public constant override defaultPluginConfig =
    uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.DYNAMIC_FEE);

  /// @inheritdoc IFarmingPlugin
  address public override pool;
  // Shared with NestMEVFeePlugin for inherited authorization checks.
  address internal factory;
  address internal pluginFactory;

  /// @inheritdoc IVolatilityOracle
  VolatilityOracle.Timepoint[UINT16_MODULO] public override timepoints;

  /// @inheritdoc IVolatilityOracle
  uint16 public override timepointIndex;

  /// @inheritdoc IVolatilityOracle
  uint32 public override lastTimepointTimestamp;

  /// @inheritdoc IVolatilityOracle
  bool public override isInitialized;

  // Deviation-fee config fields are stored individually so the compiler packs them into the same slot as
  // timepointIndex/lastTimepointTimestamp/isInitialized above. The per-swap config read then hits a slot
  // already warmed by _writeTimepoint.
  uint16 internal _baseFee; // fee on all swaps, hundredths of a bip (1e-6)
  uint16 internal _feeCap; // max total fee, hundredths of a bip
  uint64 internal _scalingFactor; // extra fee per tick of deviation, scaled by SCALING_PRECISION; 0 disables the dynamic part
  uint32 internal _twapWindow; // TWAP lookback, seconds

  /// @inheritdoc IFarmingPlugin
  address public override incentive;

  /// @dev the address which connected the last incentive. Needed so that he can disconnect it
  address private _lastIncentiveOwner;

  modifier onlyPool() {
    _checkIfFromPool();
    _;
  }

  constructor() {
    _disableInitializers();
  }

  /// @inheritdoc INestTWAPFeePlugin
  function initialize(address _pool, address _factory, address _pluginFactory) external override initializer {
    require(msg.sender == _pluginFactory, 'Only plugin factory');
    (factory, pool, pluginFactory) = (_factory, _pool, _pluginFactory);
  }

  /// @inheritdoc INestTWAPFeeManager
  function deviationFeeConfig() external view override returns (uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) {
    (baseFee, feeCap, scalingFactor, twapWindow) = (_baseFee, _feeCap, _scalingFactor, _twapWindow);
  }

  function _checkIfFromPool() internal view {
    require(msg.sender == pool, 'Only pool can call this');
  }

  function _getPoolState() internal view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig) {
    (price, tick, fee, pluginConfig, , ) = IAlgebraPoolState(pool).globalState();
  }

  function _getPluginInPool() internal view returns (address plugin) {
    return IAlgebraPool(pool).plugin();
  }

  /// @dev Administrative predicate. Do not call this on the per-swap path because it reads the factory mapping.
  function _isCurrentPlugin() internal view returns (bool) {
    if (_getPluginInPool() != address(this)) return false;
    return INestFeePluginFactory(pluginFactory).pluginByPool(pool) == address(this);
  }

  function _requireActiveRecorder() internal view {
    require(isInitialized && _isCurrentPlugin(), 'Recorder inactive');
  }

  /// @inheritdoc INestTWAPFeePlugin
  function initialize() external override {
    // Restricted to the plugin factory or a pools administrator so the oracle can't be seeded by an
    // unprivileged caller at a chosen tick during the attach-to-existing-pool flow.
    require(
      msg.sender == pluginFactory || IAlgebraFactory(factory).hasRoleOrOwner(IAlgebraFactory(factory).POOLS_ADMINISTRATOR_ROLE(), msg.sender),
      'Not authorized'
    );
    require(!isInitialized, 'Already initialized');
    require(_isCurrentPlugin(), 'Plugin not current');
    (uint160 price, int24 tick, , ) = _getPoolState();
    require(price != 0, 'Pool is not initialized');

    uint32 time = _blockTimestamp();
    timepoints.initialize(time, tick);
    lastTimepointTimestamp = time;
    isInitialized = true;

    _updatePluginConfigInPool();
  }

  // ###### Volatility and TWAP oracle ######

  /// @inheritdoc IVolatilityOracle
  function getSingleTimepoint(uint32 secondsAgo) external view override returns (int56 tickCumulative, uint88 volatilityCumulative) {
    _requireActiveRecorder();
    // `volatilityCumulative` values for timestamps after the last timepoint _should not_ be compared: they may differ due to interpolation errors
    (, int24 tick, , ) = _getPoolState();
    uint16 lastTimepointIndex = timepointIndex;
    uint16 oldestIndex = timepoints.getOldestIndex(lastTimepointIndex);
    VolatilityOracle.Timepoint memory result = timepoints.getSingleTimepoint(_blockTimestamp(), secondsAgo, tick, lastTimepointIndex, oldestIndex);
    (tickCumulative, volatilityCumulative) = (result.tickCumulative, result.volatilityCumulative);
  }

  /// @inheritdoc IVolatilityOracle
  function getTimepoints(
    uint32[] memory secondsAgos
  ) external view override returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives) {
    _requireActiveRecorder();
    // `volatilityCumulative` values for timestamps after the last timepoint _should not_ be compared: they may differ due to interpolation errors
    (, int24 tick, , ) = _getPoolState();
    return timepoints.getTimepoints(_blockTimestamp(), secondsAgos, tick, timepointIndex);
  }

  /// @inheritdoc IVolatilityOracle
  function prepayTimepointsStorageSlots(uint16 startIndex, uint16 amount) external override {
    require(!timepoints[startIndex].initialized); // if not initialized, then all subsequent ones too
    require(amount > 0 && type(uint16).max - startIndex >= amount);

    unchecked {
      for (uint256 i = startIndex; i < startIndex + amount; ++i) {
        timepoints[i].blockTimestamp = 1; // will be overwritten
      }
    }
  }

  // ###### Fee manager ######

  /// @inheritdoc INestTWAPFeeManager
  /// @dev `virtual`, delegating to an `internal _setDeviationFeeConfig`, so NestMEVFeePlugin can wrap it with
  /// the symmetric oracle-armed guard. The standalone Nest TWAP product has no override.
  function setDeviationFeeConfig(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external virtual override {
    _setDeviationFeeConfig(baseFee, feeCap, scalingFactor, twapWindow);
  }

  function _setDeviationFeeConfig(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) internal {
    require(msg.sender == pluginFactory || IAlgebraFactory(factory).hasRoleOrOwner(DEVIATION_FEE_MANAGER, msg.sender), 'Not fee manager');
    require(baseFee <= MAX_BASE_FEE, 'Base fee too high');
    require(feeCap >= baseFee && feeCap <= MAX_FEE_CAP, 'Invalid fee cap');
    require(scalingFactor <= MAX_SCALING_FACTOR, 'Scaling factor too high');
    require(scalingFactor == 0 || scalingFactor >= SCALING_PRECISION, 'Scaling factor too low');
    require(twapWindow >= MIN_TWAP_WINDOW && twapWindow <= MAX_TWAP_WINDOW, 'Invalid TWAP window');
    if (scalingFactor != 0) {
      require(feeCap > baseFee, 'No dynamic fee headroom');
      require(isTwapReady(twapWindow), 'TWAP not ready');
    }

    (_baseFee, _feeCap, _scalingFactor, _twapWindow) = (baseFee, feeCap, scalingFactor, twapWindow);
    emit DeviationFeeConfigChanged(baseFee, feeCap, scalingFactor, twapWindow);
  }

  /// @inheritdoc INestTWAPFeeManager
  function getTwapTick() external view override returns (int24 twapTick, bool available) {
    _requireActiveRecorder();
    (, int24 tick, , ) = _getPoolState();
    return _tryGetTwapTick(tick, _twapWindow);
  }

  /// @inheritdoc INestTWAPFeeManager
  function isTwapReady(uint32 window) public view override returns (bool) {
    if (!isInitialized || !_isCurrentPlugin()) return false;
    uint16 oldestIndex = timepoints.getOldestIndex(timepointIndex);
    unchecked {
      return _blockTimestamp() - timepoints[oldestIndex].blockTimestamp >= window;
    }
  }

  /// @inheritdoc IAlgebraDynamicFeePlugin
  function getCurrentFee() external view override returns (uint16 fee) {
    require(_isCurrentPlugin(), 'Plugin inactive');
    (, int24 tick, , ) = _getPoolState();
    return _getDeviationFee(tick);
  }

  /// @dev fee = min(baseFee + scalingFactor * |tick - twapTick| / SCALING_PRECISION, feeCap).
  /// Falls back to baseFee while the oracle does not yet cover the TWAP window
  /// @dev `virtual` so NestMEVFeePlugin can override with the oracle-referenced term; the standalone Nest TWAP
  /// product never overrides it.
  function _getDeviationFee(int24 currentTick) internal view virtual returns (uint16) {
    // single read of the packed config slot (warm — _writeTimepoint already touched it this swap)
    uint256 fee = _baseFee;
    uint64 scalingFactor = _scalingFactor;

    if (scalingFactor != 0) {
      (int24 twapTick, bool available) = _tryGetTwapTick(currentTick, _twapWindow);
      if (available) {
        unchecked {
          int256 delta = int256(currentTick) - int256(twapTick);
          uint256 absDelta = uint256(delta < 0 ? -delta : delta);
          fee += (absDelta * scalingFactor) / SCALING_PRECISION;
        }
      }
    }

    uint256 cap = _feeCap;
    if (fee > cap) fee = cap;
    return uint16(fee);
  }

  /// @dev Time-weighted average tick over `window` seconds, ending now.
  /// Not available until the oldest stored timepoint is at least `window` seconds old
  function _tryGetTwapTick(int24 currentTick, uint32 window) internal view returns (int24 twapTick, bool available) {
    uint16 lastIndex = timepointIndex;
    uint16 oldestIndex = timepoints.getOldestIndex(lastIndex);
    uint32 time = _blockTimestamp();

    unchecked {
      // overflow-safe elapsed time in uint32 arithmetic
      if (time - timepoints[oldestIndex].blockTimestamp < window) {
        return (0, false);
      }
    }

    VolatilityOracle.Timepoint storage last = timepoints[lastIndex];
    (uint32 lastTimestamp, int56 lastTickCumulative) = (last.blockTimestamp, last.tickCumulative);

    int56 tickCumulativeNow;
    int56 tickCumulativeThen;
    unchecked {
      // extrapolate the current cumulative from the last written timepoint
      tickCumulativeNow = lastTickCumulative + int56(currentTick) * int56(uint56(time - lastTimestamp));
      tickCumulativeThen = timepoints.getSingleTimepoint(time, window, currentTick, lastIndex, oldestIndex).tickCumulative;
      twapTick = int24((tickCumulativeNow - tickCumulativeThen) / int56(uint56(window)));
    }
    available = true;
  }

  // ###### Farming plugin ######

  /// @inheritdoc IFarmingPlugin
  function setIncentive(address newIncentive) external override {
    bool toConnect = newIncentive != address(0);
    bool accessAllowed;
    if (toConnect) {
      accessAllowed = msg.sender == INestFeePluginFactory(pluginFactory).farmingAddress();
    } else {
      // we allow the one who connected the incentive to disconnect it,
      // even if he no longer has the rights to connect incentives
      if (_lastIncentiveOwner != address(0)) {
        accessAllowed = msg.sender == _lastIncentiveOwner;
      }
      if (!accessAllowed) {
        accessAllowed = msg.sender == INestFeePluginFactory(pluginFactory).farmingAddress();
      }
    }
    require(accessAllowed, 'Not allowed to set incentive');

    bool isPluginConnected = _getPluginInPool() == address(this);
    if (toConnect) require(isPluginConnected, 'Plugin not attached');

    address currentIncentive = incentive;
    require(currentIncentive != newIncentive, 'Already active');
    if (toConnect) {
      require(currentIncentive == address(0), 'Has active incentive');
    }

    incentive = newIncentive;
    emit Incentive(newIncentive);

    if (toConnect) {
      _lastIncentiveOwner = msg.sender; // write creator of this incentive
    } else {
      _lastIncentiveOwner = address(0);
    }

    if (isPluginConnected) {
      _updatePluginConfigInPool();
    }
  }

  /// @inheritdoc IFarmingPlugin
  function isIncentiveConnected(address targetIncentive) external view override returns (bool) {
    if (incentive != targetIncentive) return false;
    if (_getPluginInPool() != address(this)) return false;
    (, , , uint8 pluginConfig) = _getPoolState();
    if (!pluginConfig.hasFlag(Plugins.AFTER_SWAP_FLAG)) return false;

    return true;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    require(_isCurrentPlugin(), 'Plugin not current');
    _updatePluginConfigInPool();
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override onlyPool returns (bytes4) {
    require(_isCurrentPlugin(), 'Plugin not current');
    uint32 _timestamp = _blockTimestamp();
    timepoints.initialize(_timestamp, tick);

    lastTimepointTimestamp = _timestamp;
    isInitialized = true;

    IAlgebraPool(pool).setFee(_baseFee);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeModifyPosition(address, address, int24, int24, int128, bytes calldata) external override onlyPool returns (bytes4) {
    return IAlgebraPlugin.beforeModifyPosition.selector;
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address, address, bool, int256, uint160, bool, bytes calldata) external override onlyPool returns (bytes4) {
    // single pre-swap pool-state snapshot, shared by the oracle write and the fee update
    (, int24 tick, uint16 fee, ) = _getPoolState();
    _writeTimepoint(tick);
    _updateDeviationFee(tick, fee);
    return IAlgebraPlugin.beforeSwap.selector;
  }

  function afterSwap(address, address, bool zeroToOne, int256, uint160, int256, int256, bytes calldata) external override onlyPool returns (bytes4) {
    address _incentive = incentive;
    if (_incentive != address(0)) {
      (, int24 tick, , ) = _getPoolState();
      IAlgebraVirtualPool(_incentive).crossTo(tick, zeroToOne);
    } else {
      _updatePluginConfigInPool(); // should not be called, reset config
    }

    return IAlgebraPlugin.afterSwap.selector;
  }

  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(); // should not be called, reset config
    return IAlgebraPlugin.afterFlash.selector;
  }

  function _updatePluginConfigInPool() internal {
    uint8 newPluginConfig = defaultPluginConfig;
    if (incentive != address(0)) {
      newPluginConfig |= uint8(Plugins.AFTER_SWAP_FLAG);
    }

    (, , , uint8 currentPluginConfig) = _getPoolState();
    if (currentPluginConfig != newPluginConfig) {
      IAlgebraPool(pool).setPluginConfig(newPluginConfig);
    }
  }

  /// @dev Writes a timepoint at most once per second; the deviation fee is updated separately on every swap
  function _writeTimepoint(int24 tick) internal {
    uint16 _lastIndex = timepointIndex;
    uint32 _lastTimepointTimestamp = lastTimepointTimestamp;
    require(isInitialized, 'Not initialized');

    uint32 currentTimestamp = _blockTimestamp();
    if (_lastTimepointTimestamp == currentTimestamp) return;

    (uint16 newLastIndex, ) = timepoints.write(_lastIndex, currentTimestamp, tick);

    timepointIndex = newLastIndex;
    lastTimepointTimestamp = currentTimestamp;
  }

  /// @dev Recalculated on EVERY swap, including repeated swaps within one block: the tick moved by a
  /// previous swap in the same block immediately raises the fee for the next one (anti-sandwich)
  function _updateDeviationFee(int24 tick, uint16 fee) internal virtual {
    uint16 newFee = _getDeviationFee(tick);
    if (newFee != fee) {
      IAlgebraPool(pool).setFee(newFee);
    }
  }

  /// @dev Reserved layout padding for beacon-proxy storage compatibility.
  uint256[50] private __gap;
}
