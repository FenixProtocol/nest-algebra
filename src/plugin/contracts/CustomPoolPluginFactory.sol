// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';

import './interfaces/IAlgebraBasePluginV1.sol';
import './interfaces/ICustomPoolPluginFactory.sol';
import './libraries/AdaptiveFee.sol';

/// @title Algebra custom pool plugin factory
/// @dev This contract is an edited copy of BasePluginV1Factory created for custom pools logic.
/// @notice Entry point for custom pool creation and custom pool plugin deployment.
contract CustomPoolPluginFactory is ICustomPoolPluginFactory, AccessControlEnumerableUpgradeable, Ownable2StepUpgradeable {
  /// @notice Role that can deploy custom pools when public creation mode is disabled.
  bytes32 public constant override CUSTOM_POOL_DEPLOYER = keccak256('CUSTOM_POOL_DEPLOYER');

  /// @notice Algebra factory used for custom pool deployment.
  address public override factory;

  /// @notice Algebra custom pool entry point used to create and manage custom pools.
  address public override algebraCustomPoolEntryPoint;

  /// @notice Whether custom pool creation is public.
  bool public override isPublicPoolCreationMode;

  /// @notice Current default dynamic fee configuration for newly created plugins.
  AlgebraFeeConfiguration public override defaultFeeConfiguration;

  /// @inheritdoc IBeacon
  address public override implementation;

  /// @notice Plugin created for each custom pool.
  mapping(address pool => address plugin) public override pluginByPool;

  /// @notice Whether a token can be used for custom pool creation.
  mapping(address token => bool allowed) public override isWhitelistedToken;

  /// @notice Whether a pool was created through this factory.
  mapping(address pool => bool allowed) public override isCustomPool;

  struct PendingCustomPool {
    address creator;
    address token0;
    address token1;
    address plugin;
    bytes32 dataHash;
  }

  mapping(address pool => PendingCustomPool pendingCustomPool) private _pendingCustomPoolByAddress;

  constructor() {
    _disableInitializers();
  }

  function initialize(address _factory, address _algebraCustomPoolEntryPoint, address _pluginImplementation) external initializer {
    require(_factory != address(0));
    require(_algebraCustomPoolEntryPoint != address(0));

    __AccessControlEnumerable_init();
    __Ownable2Step_init();

    factory = _factory;
    algebraCustomPoolEntryPoint = _algebraCustomPoolEntryPoint;
    defaultFeeConfiguration = AdaptiveFee.initialFeeConfiguration();

    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(CUSTOM_POOL_DEPLOYER, msg.sender);
    _setImplementation(_pluginImplementation);

    emit DefaultFeeConfiguration(defaultFeeConfiguration);
  }

  /// @notice Deploys a custom pool with a newly created default plugin.
  /// @param tokenA One token from the pair.
  /// @param tokenB The other token from the pair.
  /// @param data Additional plugin creation data.
  /// @return customPool The newly created custom pool.
  function deployCustomPool(address tokenA, address tokenB, bytes calldata data) external returns (address customPool) {
    if (!isPublicPoolCreationMode) {
      _checkRole(CUSTOM_POOL_DEPLOYER);
    }
    require(isWhitelistedToken[tokenA], 'TokenA not whitelisted');
    require(isWhitelistedToken[tokenB], 'TokenB not whitelisted');

    (address token0, address token1) = _sortTokens(tokenA, tokenB);
    address expectedPool = IAlgebraFactory(factory).computeCustomPoolAddress(address(this), token0, token1);
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
  function createPlugin(address, address, address) external pure override returns (address) {
    revert('Deprecated');
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

    PendingCustomPool storage pendingCustomPool = _pendingCustomPoolByAddress[pool];
    require(pendingCustomPool.creator == creator, 'Invalid creator');
    require(pendingCustomPool.token0 == token0 && pendingCustomPool.token1 == token1, 'Invalid tokens');
    require(pendingCustomPool.dataHash == keccak256(data), 'Invalid data');

    plugin = _createPlugin(pool);
    pendingCustomPool.plugin = plugin;
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address plugin, address pool, address deployer) external override {
    require(msg.sender == algebraCustomPoolEntryPoint, 'Only entry point');
    require(deployer == address(this), 'Invalid deployer');

    PendingCustomPool storage pendingCustomPool = _pendingCustomPoolByAddress[pool];
    require(pendingCustomPool.creator != address(0), 'Pool not pending');
    require(pendingCustomPool.plugin == plugin, 'Invalid plugin');
    require(pluginByPool[pool] == plugin, 'Plugin not created');

    delete _pendingCustomPoolByAddress[pool];
    isCustomPool[pool] = true;
  }

  /// @notice Changes tick spacing in a custom pool created by this factory.
  function setTickSpacing(address pool, int24 newTickSpacing) external onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setTickSpacing(pool, newTickSpacing);
  }

  /// @notice Changes plugin address in a custom pool created by this factory.
  function setPlugin(address pool, address newPluginAddress) external onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setPlugin(pool, newPluginAddress);
  }

  /// @notice Changes plugin config in a custom pool created by this factory.
  function setPluginConfig(address pool, uint8 newConfig) external onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setPluginConfig(pool, newConfig);
  }

  /// @notice Changes fee in a custom pool created by this factory.
  function setFee(address pool, uint16 newFee) external onlyOwner {
    _checkCustomPool(pool);
    IAlgebraCustomPoolEntryPoint(algebraCustomPoolEntryPoint).setFee(pool, newFee);
  }

  /// @notice Changes public custom pool creation mode.
  function setPublicPoolCreationMode(bool mode) external onlyOwner {
    require(isPublicPoolCreationMode != mode);
    isPublicPoolCreationMode = mode;
    emit PublicPoolCreationMode(mode);
  }

  /// @notice Changes a token whitelist status.
  function setTokenWhitelist(address token, bool allowed) external onlyOwner {
    _setTokenWhitelist(token, allowed);
  }

  /// @notice Changes whitelist status for a batch of tokens.
  function setTokenWhitelistBatch(address[] calldata tokens, bool allowed) external onlyOwner {
    uint256 tokensLength = tokens.length;
    for (uint256 i; i < tokensLength; ++i) {
      _setTokenWhitelist(tokens[i], allowed);
    }
  }

  /// @notice Changes initial fee configuration for new plugins.
  function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external onlyOwner {
    AdaptiveFee.validateFeeConfiguration(newConfig);
    defaultFeeConfiguration = newConfig;
    emit DefaultFeeConfiguration(newConfig);
  }

  /// @notice Upgrades the beacon to a new implementation.
  function upgradeTo(address newImplementation) external onlyOwner {
    _setImplementation(newImplementation);
  }

  function _createPlugin(address pool) internal returns (address plugin) {
    require(pluginByPool[pool] == address(0), 'Already created');
    IAlgebraBasePluginV1 customPoolPlugin = IAlgebraBasePluginV1(address(new BeaconProxy(address(this), '')));
    customPoolPlugin.initialize(pool, factory, address(this));
    customPoolPlugin.changeFeeConfiguration(defaultFeeConfiguration);
    plugin = address(customPoolPlugin);
    pluginByPool[pool] = plugin;
  }

  function _setTokenWhitelist(address token, bool allowed) internal {
    require(token != address(0));
    require(isWhitelistedToken[token] != allowed);
    isWhitelistedToken[token] = allowed;
    emit TokenWhitelist(token, allowed);
  }

  function _setImplementation(address newImplementation) internal {
    if (newImplementation.code.length == 0) {
      revert BeaconInvalidImplementation(newImplementation);
    }
    implementation = newImplementation;
    emit Upgraded(newImplementation);
  }

  function _checkCustomPool(address pool) internal view {
    require(isCustomPool[pool], 'Unknown custom pool');
  }

  function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
    require(tokenA != tokenB);
    (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0));
  }

  /// @dev Transfers ownership of the contract to a new account.
  function _transferOwnership(address newOwner) internal override {
    _revokeRole(DEFAULT_ADMIN_ROLE, owner());
    super._transferOwnership(newOwner);
    if (owner() != address(0)) {
      _grantRole(DEFAULT_ADMIN_ROLE, owner());
    }
  }

  uint256[50] private __gap;
}
