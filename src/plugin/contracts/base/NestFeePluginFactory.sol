// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/access/AccessControlEnumerable.sol';
import '@openzeppelin/contracts/access/Ownable2Step.sol';
import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';

import '../interfaces/INestFeePluginFactory.sol';
import '../interfaces/INestTWAPFeePlugin.sol';

/// @title Shared Nest fee-plugin factory implementation
/// @notice Creates Nest fee plugins for standard, existing, and custom Algebra pools.
abstract contract NestFeePluginFactory is INestFeePluginFactory, AccessControlEnumerable, Ownable2Step {
  struct DeviationFeeConfig {
    uint16 baseFee;
    uint16 feeCap;
    uint64 scalingFactor;
    uint32 twapWindow;
  }

  struct PendingCustomPool {
    address creator;
    address token0;
    address token1;
    address plugin;
    bytes32 dataHash;
  }

  bytes32 public constant override ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');
  bytes32 public constant override CUSTOM_POOL_DEPLOYER = keccak256('CUSTOM_POOL_DEPLOYER');

  uint16 internal constant DEFAULT_BASE_FEE = 0.05e4;
  uint16 internal constant DEFAULT_FEE_CAP = 1e4;
  uint32 internal constant DEFAULT_TWAP_WINDOW = 600;

  address public immutable override algebraFactory;
  address public immutable override algebraCustomPoolEntryPoint;
  address public override implementation;
  DeviationFeeConfig public override defaultDeviationFeeConfiguration;
  address public override farmingAddress;
  bool public override isPublicPoolCreationMode;

  mapping(address pool => address plugin) public override pluginByPool;
  mapping(address pool => bool created) public override isCustomPool;
  mapping(address pool => PendingCustomPool pendingPool) private _pendingCustomPoolByAddress;

  modifier onlyAdministrator() {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR, msg.sender), 'Only administrator');
    _;
  }

  constructor(address _algebraFactory, address _algebraCustomPoolEntryPoint, address _pluginImplementation) {
    require(_algebraFactory.code.length != 0, 'Invalid Algebra factory');
    require(_algebraCustomPoolEntryPoint.code.length != 0, 'Invalid custom pool entry point');

    algebraFactory = _algebraFactory;
    algebraCustomPoolEntryPoint = _algebraCustomPoolEntryPoint;
    defaultDeviationFeeConfiguration = DeviationFeeConfig(DEFAULT_BASE_FEE, DEFAULT_FEE_CAP, 0, DEFAULT_TWAP_WINDOW);

    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(CUSTOM_POOL_DEPLOYER, msg.sender);
    _setImplementation(_pluginImplementation);

    emit DefaultDeviationFeeConfiguration(DEFAULT_BASE_FEE, DEFAULT_FEE_CAP, 0, DEFAULT_TWAP_WINDOW);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function createPlugin(address pool, address, address) external override returns (address) {
    require(msg.sender == algebraFactory, 'Only Algebra factory');
    return _createPlugin(pool);
  }

  /// @inheritdoc INestFeePluginFactory
  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender), 'Only pools administrator');

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');
    return _createPlugin(pool);
  }

  /// @inheritdoc INestFeePluginFactory
  function deployCustomPool(address tokenA, address tokenB, bytes calldata data) external override returns (address customPool) {
    if (!isPublicPoolCreationMode) _checkRole(CUSTOM_POOL_DEPLOYER);

    (address token0, address token1) = _sortTokens(tokenA, tokenB);
    address expectedPool = IAlgebraFactory(algebraFactory).computeCustomPoolAddress(address(this), token0, token1);
    require(_pendingCustomPoolByAddress[expectedPool].creator == address(0), 'Pool creation pending');

    _pendingCustomPoolByAddress[expectedPool] = PendingCustomPool({
      creator: msg.sender,
      token0: token0,
      token1: token1,
      plugin: address(0),
      dataHash: keccak256(data)
    });

    customPool = IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).createCustomPool(address(this), msg.sender, tokenA, tokenB, data);
    require(customPool == expectedPool, 'Invalid custom pool');
    require(isCustomPool[customPool], 'Custom pool hook missing');
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(
    address pool,
    address creator,
    address deployer,
    address token0,
    address token1,
    bytes calldata data
  ) external override returns (address plugin) {
    require(msg.sender == algebraCustomPoolEntryPoint, 'Only entry point');
    require(deployer == address(this), 'Invalid deployer');

    PendingCustomPool storage pendingPool = _pendingCustomPoolByAddress[pool];
    require(pendingPool.creator == creator, 'Invalid creator');
    require(pendingPool.token0 == token0 && pendingPool.token1 == token1, 'Invalid tokens');
    require(pendingPool.dataHash == keccak256(data), 'Invalid data');

    plugin = _createPlugin(pool);
    pendingPool.plugin = plugin;
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address plugin, address pool, address deployer) external override {
    require(msg.sender == algebraCustomPoolEntryPoint, 'Only entry point');
    require(deployer == address(this), 'Invalid deployer');

    PendingCustomPool storage pendingPool = _pendingCustomPoolByAddress[pool];
    require(pendingPool.creator != address(0), 'Pool not pending');
    require(pendingPool.plugin == plugin, 'Invalid plugin');
    require(pluginByPool[pool] == plugin, 'Plugin not created');

    delete _pendingCustomPoolByAddress[pool];
    isCustomPool[pool] = true;
  }

  /// @inheritdoc INestFeePluginFactory
  function setTickSpacing(address pool, int24 newTickSpacing) external override onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setTickSpacing(pool, newTickSpacing);
  }

  /// @inheritdoc INestFeePluginFactory
  function setPlugin(address pool, address newPluginAddress) external override onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setPlugin(pool, newPluginAddress);
  }

  /// @inheritdoc INestFeePluginFactory
  function setPluginConfig(address pool, uint8 newConfig) external override onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setPluginConfig(pool, newConfig);
  }

  /// @inheritdoc INestFeePluginFactory
  function setFee(address pool, uint16 newFee) external override onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setFee(pool, newFee);
  }

  /// @inheritdoc INestFeePluginFactory
  function setPublicPoolCreationMode(bool mode) external override onlyOwner {
    require(isPublicPoolCreationMode != mode, 'Mode unchanged');
    isPublicPoolCreationMode = mode;
    emit PublicPoolCreationMode(mode);
  }

  /// @inheritdoc INestFeePluginFactory
  function setDefaultDeviationFeeConfiguration(
    uint16 baseFee,
    uint16 feeCap,
    uint64 scalingFactor,
    uint32 twapWindow
  ) external override onlyAdministrator {
    require(scalingFactor == 0, 'Default must be inert');
    require(baseFee <= 30_000, 'Base fee too high');
    require(feeCap >= baseFee && feeCap <= 50_000, 'Invalid fee cap');
    require(twapWindow >= 60 && twapWindow <= 12 hours, 'Invalid TWAP window');
    defaultDeviationFeeConfiguration = DeviationFeeConfig(baseFee, feeCap, scalingFactor, twapWindow);
    emit DefaultDeviationFeeConfiguration(baseFee, feeCap, scalingFactor, twapWindow);
  }

  /// @inheritdoc INestFeePluginFactory
  function setFarmingAddress(address newFarmingAddress) external override onlyAdministrator {
    require(farmingAddress != newFarmingAddress, 'Farming address unchanged');
    farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }

  /// @inheritdoc INestFeePluginFactory
  function upgradeTo(address newImplementation) external override onlyAdministrator {
    _setImplementation(newImplementation);
  }

  /// @dev Deploys and initializes a plugin for `pool`. Derived factories can override this
  /// implementation when their plugin uses a different fee configuration interface.
  function _createPlugin(address pool) internal virtual returns (address pluginAddress) {
    require(pluginByPool[pool] == address(0), 'Already created');
    INestTWAPFeePlugin plugin = INestTWAPFeePlugin(address(new BeaconProxy(address(this), '')));
    plugin.initialize(pool, algebraFactory, address(this));
    DeviationFeeConfig memory config = defaultDeviationFeeConfiguration;
    plugin.setDeviationFeeConfig(config.baseFee, config.feeCap, config.scalingFactor, config.twapWindow);
    pluginAddress = address(plugin);
    pluginByPool[pool] = pluginAddress;
  }

  function _setImplementation(address newImplementation) internal {
    if (newImplementation.code.length == 0) revert BeaconInvalidImplementation(newImplementation);
    implementation = newImplementation;
    emit Upgraded(newImplementation);
  }

  function _checkCustomPool(address pool) internal view {
    require(isCustomPool[pool], 'Unknown custom pool');
  }

  function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
    require(tokenA != tokenB, 'Identical tokens');
    (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0), 'Zero token');
  }

  function _transferOwnership(address newOwner) internal override {
    _revokeRole(DEFAULT_ADMIN_ROLE, owner());
    super._transferOwnership(newOwner);
    if (newOwner != address(0)) _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
  }
}
