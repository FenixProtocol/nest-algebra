// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';

import './NestTWAPFeePlugin.sol';
import './libraries/HyperCoreSpotOracle.sol';
import './interfaces/INestMEVFeeManager.sol';

/// @title NestMEVFeePlugin
/// @notice The Nest TWAP fee product plus a spot-oracle-referenced LVR/peg term:
/// fee = clamp(base + max(scalingFactor * |tick - TWAP_short| / SCALING_PRECISION,
///                        klvr * max(0, effectiveGap - deadband) / SCALING_PRECISION), base, cap),
/// where effectiveGap = min(max(|tick-spot|, |blockStartTick-spot|), MAX_PRICED_GAP).
/// @dev Safety model:
/// - klvr == 0 is behaviorally equivalent to NestTWAPFeePlugin and makes no precompile call.
/// - Only a structurally invalid spot read selects internal-TWAP fallback.
/// - Every structurally valid spot observation uses the Nest MEV formula; gap size only saturates the priced input.
/// - Spot-market manipulation resistance is an external economic assumption measured before arming.
contract NestMEVFeePlugin is NestTWAPFeePlugin, INestMEVFeeManager {
  uint64 public constant MAX_KLVR = uint64(100 * SCALING_PRECISION);
  uint32 public constant MAX_DEADBAND = 100;
  uint8 public constant MAX_ORACLE_PRICE_EXP = 60;
  uint32 public constant MAX_CONFIG_GAP = 2000;
  uint256 internal constant MAX_PRICED_GAP = 10000;
  uint64 public constant MIN_ORACLE_LIVE_SCALING = uint64(100 * SCALING_PRECISION);
  uint64 public constant MAX_FALLBACK_SCALING_FACTOR = uint64(50 * SCALING_PRECISION);
  uint256 internal constant FEE_UNITS_PER_TICK = 100;
  uint256 public constant MIN_LVR_EDGE_MARGIN = 100;

  // Slot A: 26/32 bytes.
  uint64 internal _klvr;
  uint32 internal _oracleDeadband;
  uint32 internal _sandWindow;
  uint32 internal _oracleSpotIndex;
  uint8 internal _oraclePriceExp;
  bool internal _oracleInverted;
  uint32 internal _maxConfigGap;

  // Slot B: 16/32 bytes.
  uint64 internal _fallbackScalingFactor;
  int24 internal _blockStartTick;
  uint32 internal _blockStartBlock;
  bool internal _lastOracleLive;

  /// @inheritdoc INestMEVFeeManager
  function mevFeeConfig()
    external
    view
    override
    returns (uint64 klvr, uint32 deadband, uint32 shortTwapWindow, uint32 spotIndex, uint8 priceExp, bool inverted, uint32 maxConfigGap)
  {
    return (_klvr, _oracleDeadband, _sandWindow, _oracleSpotIndex, _oraclePriceExp, _oracleInverted, _maxConfigGap);
  }

  /// @inheritdoc INestMEVFeeManager
  function setOracleConfig(
    uint64 klvr,
    uint32 deadband,
    uint32 shortTwapWindow,
    uint32 spotIndex,
    uint8 priceExp,
    bool inverted,
    uint32 maxConfigGap
  ) external override {
    require(msg.sender == pluginFactory || IAlgebraFactory(factory).hasRoleOrOwner(DEVIATION_FEE_MANAGER, msg.sender), 'Not fee manager');
    require(klvr <= MAX_KLVR, 'Klvr too high');
    require(klvr == 0 || klvr >= SCALING_PRECISION, 'Klvr too low (raw units?)');
    require(deadband <= MAX_DEADBAND, 'Deadband too high');
    require(priceExp <= MAX_ORACLE_PRICE_EXP, 'Price exp too high');
    require(maxConfigGap <= MAX_CONFIG_GAP, 'Gap bound too high');

    if (_klvr != 0) {
      require(spotIndex == _oracleSpotIndex && priceExp == _oraclePriceExp && inverted == _oracleInverted, 'Disarm before identity change');
    }

    if (klvr != 0) {
      require(_feeCap > _baseFee, 'No dynamic fee headroom');
      require(_scalingFactor >= MIN_ORACLE_LIVE_SCALING, 'Sandwich slope below floor');
      require(_fallbackScalingFactor != 0, 'Set fallback slope first');
      require(shortTwapWindow >= MIN_TWAP_WINDOW && shortTwapWindow <= MAX_TWAP_WINDOW, 'Invalid short TWAP window');
      require(isTwapReady(shortTwapWindow), 'Short TWAP not ready');
      require(uint256(deadband) * FEE_UNITS_PER_TICK > uint256(_baseFee) + MIN_LVR_EDGE_MARGIN, 'Insufficient LVR edge');

      (uint160 price, int24 tick, , ) = _getPoolState();
      require(price != 0, 'Pool not initialized');
      (int24 oracleTick, bool ok) = HyperCoreSpotOracle.getOracleTick(spotIndex, priceExp, inverted);
      require(ok, 'Oracle read failed');
      require(_absDiff(tick, oracleTick) <= maxConfigGap, 'Oracle gap too large');
    }

    (_klvr, _oracleDeadband, _sandWindow, _oracleSpotIndex, _oraclePriceExp, _oracleInverted, _maxConfigGap) = (
      klvr,
      deadband,
      shortTwapWindow,
      spotIndex,
      priceExp,
      inverted,
      maxConfigGap
    );
    // A successful live configuration has just completed a valid stipended spot read. Off-chain status consumers
    // must also process OracleConfigChanged: klvr=0 means DISABLED; klvr>0 means LIVE.
    if (klvr != 0) _lastOracleLive = true;
    emit OracleConfigChanged(klvr, deadband, shortTwapWindow, spotIndex, priceExp, inverted, maxConfigGap);
  }

  /// @notice While armed, the sandwich slope is pinned at normalized slope 1.0. The intended 60-second
  /// shortTwapWindow limits the duration of lag after a genuine move but does not eliminate it.
  function setDeviationFeeConfig(uint16 baseFee, uint16 feeCap, uint64 scalingFactor, uint32 twapWindow) external virtual override {
    if (_klvr != 0) {
      require(scalingFactor >= MIN_ORACLE_LIVE_SCALING, 'Sandwich slope below floor');
      require(uint256(_oracleDeadband) * FEE_UNITS_PER_TICK > uint256(baseFee) + MIN_LVR_EDGE_MARGIN, 'Insufficient LVR edge');
    }
    _setDeviationFeeConfig(baseFee, feeCap, scalingFactor, twapWindow);
  }

  /// @inheritdoc INestMEVFeeManager
  function fallbackScalingFactor() external view override returns (uint64) {
    return _fallbackScalingFactor;
  }

  /// @inheritdoc INestMEVFeeManager
  function setFallbackScalingFactor(uint64 slope) external override {
    require(msg.sender == pluginFactory || IAlgebraFactory(factory).hasRoleOrOwner(DEVIATION_FEE_MANAGER, msg.sender), 'Not fee manager');
    require(slope <= MAX_FALLBACK_SCALING_FACTOR, 'Fallback slope too high');
    require(slope == 0 || slope >= SCALING_PRECISION, 'Slope too low (raw units?)');
    require(_klvr == 0 || slope != 0, 'Fallback required while armed');
    _fallbackScalingFactor = slope;
    emit FallbackScalingFactorChanged(slope);
  }

  /// @dev One oracle read per armed swap. The observation is passed into the pure fee-mode branch instead of
  /// virtual-dispatching through the parent TWAP implementation and reading the precompile twice.
  function _updateDeviationFee(int24 currentTick, uint16 currentFee) internal virtual override {
    if (_klvr == 0) {
      super._updateDeviationFee(currentTick, currentFee);
      return;
    }
    if (_blockStartBlock != uint32(block.number)) {
      (_blockStartBlock, _blockStartTick) = (uint32(block.number), currentTick);
    }
    (int24 oracleTick, bool live) = HyperCoreSpotOracle.getOracleTick(_oracleSpotIndex, _oraclePriceExp, _oracleInverted);
    uint16 newFee = _feeFromObservation(currentTick, oracleTick, live);
    if (live != _lastOracleLive) {
      _lastOracleLive = live;
      emit OracleFallback(!live);
    }
    if (newFee != currentFee) IAlgebraPool(pool).setFee(newFee);
  }

  /// @dev View calculation makes no precompile call in Nest TWAP mode and one in armed Nest MEV mode.
  function _getDeviationFee(int24 currentTick) internal view virtual override returns (uint16) {
    if (_klvr == 0) return super._getDeviationFee(currentTick);
    (int24 oracleTick, bool live) = HyperCoreSpotOracle.getOracleTick(_oracleSpotIndex, _oraclePriceExp, _oracleInverted);
    return _feeFromObservation(currentTick, oracleTick, live);
  }

  /// @dev Fallback is reachable only through live=false. Gap size never chooses the fallback branch.
  function _feeFromObservation(int24 currentTick, int24 oracleTick, bool live) internal view returns (uint16) {
    uint256 fee = _baseFee;
    uint64 scalingFactor = _scalingFactor;

    if (!live) {
      uint64 fallbackSlope = _fallbackScalingFactor != 0 ? _fallbackScalingFactor : scalingFactor;
      if (fallbackSlope != 0) fee += _selfTwapFee(currentTick, _twapWindow, fallbackSlope);
    } else {
      uint256 actualGap = _absDiff(currentTick, oracleTick);
      if (_blockStartBlock == uint32(block.number)) {
        uint256 startGap = _absDiff(_blockStartTick, oracleTick);
        if (startGap > actualGap) actualGap = startGap;
      }
      uint256 effectiveGap = actualGap > MAX_PRICED_GAP ? MAX_PRICED_GAP : actualGap;

      uint256 sandTerm = scalingFactor != 0 ? _selfTwapFee(currentTick, _sandWindow, scalingFactor) : 0;
      uint256 deadband = _oracleDeadband;
      uint256 lvrTerm = effectiveGap > deadband ? ((effectiveGap - deadband) * _klvr) / SCALING_PRECISION : 0;
      fee += sandTerm > lvrTerm ? sandTerm : lvrTerm;
    }

    uint256 cap = _feeCap;
    if (fee > cap) fee = cap;
    return uint16(fee);
  }

  function _selfTwapFee(int24 currentTick, uint32 window, uint64 scalingFactor) private view returns (uint256) {
    if (window == 0) return 0;
    (int24 twapTick, bool available) = _tryGetTwapTick(currentTick, window);
    if (!available) return 0;
    return (_absDiff(currentTick, twapTick) * scalingFactor) / SCALING_PRECISION;
  }

  function _absDiff(int24 a, int24 b) private pure returns (uint256) {
    int256 difference = int256(a) - int256(b);
    return uint256(difference < 0 ? -difference : difference);
  }

  /// @dev Reserved layout padding for beacon-proxy storage compatibility.
  uint256[49] private __mevGap;
}
