// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title Manager interface for the Nest oracle-referenced LVR/peg fee term
/// @notice Nest MEV mode combines the parent base/sandwich self-TWAP term with a second term measured against
/// the external HyperCore spot price. This interface covers the MEV-specific oracle configuration; the
/// base/cap/scaling/TWAP-window configuration remains in INestTWAPFeeManager.
/// @dev klvr == 0 disables the oracle term entirely, making the plugin equivalent to NestTWAPFeePlugin.
interface INestMEVFeeManager {
  /// @notice Emitted when the Nest MEV oracle configuration changes
  /// @param klvr        LVR-term slope in fee-units/tick * SCALING_PRECISION; 0 selects Nest TWAP behavior
  /// @param deadband    D, ticks — gaps within D pay no LVR fee (the structural no-arb band)
  /// @param shortTwapWindow short self-TWAP window for the sandwich term, seconds
  /// @param spotIndex   configured HyperCore spot-pair index
  /// @param priceExp    power-of-ten divisor mapping the configured raw feed to the Algebra ratio
  /// @param inverted    precompile quote orientation
  /// @param maxConfigGap activation-time bound (ticks) on |poolTick - oracleTick|
  event OracleConfigChanged(
    uint64 klvr,
    uint32 deadband,
    uint32 shortTwapWindow,
    uint32 spotIndex,
    uint8 priceExp,
    bool inverted,
    uint32 maxConfigGap
  );

  /// @notice Current Nest MEV oracle configuration
  function mevFeeConfig()
    external
    view
    returns (uint64 klvr, uint32 deadband, uint32 shortTwapWindow, uint32 spotIndex, uint8 priceExp, bool inverted, uint32 maxConfigGap);

  /// @notice Enable, retune, or disable (klvr=0) the Nest MEV oracle term.
  /// @dev Callable by the plugin factory or holders of the DEVIATION_FEE_MANAGER role. When enabling
  /// (klvr > 0) it performs an activation-time gap check: the live |poolTick - oracleTick| must be
  /// <= maxConfigGap. This rejects structurally valid observations that are outside the configured arming
  /// bound; it does not independently establish that an in-bound feed is economically correct. Enforces
  /// klvr <= MAX_KLVR (slope <= 1.0).
  function setOracleConfig(
    uint64 klvr,
    uint32 deadband,
    uint32 shortTwapWindow,
    uint32 spotIndex,
    uint8 priceExp,
    bool inverted,
    uint32 maxConfigGap
  ) external;

  /// @notice Emitted by the swap path when oracle availability changes relative to the contract's current
  /// transition tracker. engaged=true means the swap used internal-TWAP fallback; false means it used live spot.
  /// Status consumers must also process OracleConfigChanged: klvr=0 resets status to DISABLED and klvr>0
  /// resets status to LIVE after a successful stipended configuration-time read.
  event OracleFallback(bool engaged);

  /// @notice Emitted when the oracle-failure fallback slope changes
  event FallbackScalingFactorChanged(uint64 slope);

  /// @notice Slope used only in the oracle-failure fallback on the inherited long TWAP. It must be nonzero
  /// while armed; zero is permitted only while disarmed.
  function fallbackScalingFactor() external view returns (uint64);

  /// @notice Set the oracle-failure fallback slope (fee-units/tick * SCALING_PRECISION).
  /// @dev Callable by the plugin factory or holders of the DEVIATION_FEE_MANAGER role. Does not affect klvr==0.
  function setFallbackScalingFactor(uint64 slope) external;
}
