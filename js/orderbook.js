"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _0x_js_1 = require("0x.js");
const order_watcher_1 = require("@0x/order-watcher");
const types_1 = require("@0x/types");
const utils_1 = require("@0x/utils");
const _ = require("lodash");
//@ts-ignore
const echo_web3_1 = require("echo-web3");
const config_1 = require("./config");
const constants_1 = require("./constants");
const db_connection_1 = require("./db_connection");
const SignedOrderModel_1 = require("./models/SignedOrderModel");
const paginator_1 = require("./paginator");
const utils_2 = require("./utils");
class OrderBook {
    constructor() {
        this._shadowedOrders = new Map();
        this._orderWatcher = null;
        this._contractWrappers = null;
    }
    static async getOrderByHashIfExistsAsync(orderHash) {
        const connection = db_connection_1.getDBConnection();
        const signedOrderModelIfExists = await connection.manager.findOne(SignedOrderModel_1.SignedOrderModel, orderHash);
        if (signedOrderModelIfExists === undefined) {
            return undefined;
        }
        else {
            const deserializedOrder = deserializeOrder(signedOrderModelIfExists);
            return { metaData: {}, order: deserializedOrder };
        }
    }
    static async getAssetPairsAsync(page, perPage, assetDataA, assetDataB) {
        const connection = db_connection_1.getDBConnection();
        const signedOrderModels = (await connection.manager.find(SignedOrderModel_1.SignedOrderModel));
        const erc721AssetDataToAsset = (assetData) => {
            const asset = {
                minAmount: new _0x_js_1.BigNumber(0),
                maxAmount: new _0x_js_1.BigNumber(1),
                precision: 0,
                assetData,
            };
            return asset;
        };
        const erc20AssetDataToAsset = (assetData) => {
            const asset = {
                minAmount: new _0x_js_1.BigNumber(0),
                maxAmount: constants_1.MAX_TOKEN_SUPPLY_POSSIBLE,
                precision: config_1.DEFAULT_ERC20_TOKEN_PRECISION,
                assetData,
            };
            return asset;
        };
        const assetDataToAsset = (assetData) => {
            const assetProxyId = _0x_js_1.assetDataUtils.decodeAssetProxyId(assetData);
            let asset;
            switch (assetProxyId) {
                case types_1.AssetProxyId.ERC20:
                    asset = erc20AssetDataToAsset(assetData);
                    break;
                case types_1.AssetProxyId.ERC721:
                    asset = erc721AssetDataToAsset(assetData);
                    break;
                default:
                    throw utils_1.errorUtils.spawnSwitchErr('assetProxyId', assetProxyId);
            }
            return asset;
        };
        const signedOrderToAssetPair = (signedOrder) => {
            return {
                assetDataA: assetDataToAsset(signedOrder.makerAssetData),
                assetDataB: assetDataToAsset(signedOrder.takerAssetData),
            };
        };
        const assetPairsItems = signedOrderModels.map(deserializeOrder).map(signedOrderToAssetPair);
        let nonPaginatedFilteredAssetPairs;
        if (assetDataA === undefined && assetDataB === undefined) {
            nonPaginatedFilteredAssetPairs = assetPairsItems;
        }
        else if (assetDataA !== undefined && assetDataB !== undefined) {
            const containsAssetDataAAndAssetDataB = (assetPair) => (assetPair.assetDataA.assetData === assetDataA && assetPair.assetDataB.assetData === assetDataB) ||
                (assetPair.assetDataA.assetData === assetDataB && assetPair.assetDataB.assetData === assetDataA);
            nonPaginatedFilteredAssetPairs = assetPairsItems.filter(containsAssetDataAAndAssetDataB);
        }
        else {
            const assetData = assetDataA || assetDataB;
            const containsAssetData = (assetPair) => assetPair.assetDataA.assetData === assetData || assetPair.assetDataB.assetData === assetData;
            nonPaginatedFilteredAssetPairs = assetPairsItems.filter(containsAssetData);
        }
        const uniqueNonPaginatedFilteredAssetPairs = _.uniqWith(nonPaginatedFilteredAssetPairs, _.isEqual.bind(_));
        const paginatedFilteredAssetPairs = paginator_1.paginate(uniqueNonPaginatedFilteredAssetPairs, page, perPage);
        return paginatedFilteredAssetPairs;
    }
    async init() {
        const echoProvider = new echo_web3_1.EchoProvider(config_1.RPC_URL);
        await echoProvider.init();
        const provider = new _0x_js_1.Web3ProviderEngine();
        provider.addProvider(new _0x_js_1.ProviderSubprovider(echoProvider));
        provider.start();
        this._contractWrappers = new _0x_js_1.ContractWrappers(provider, {
            networkId: config_1.NETWORK_ID,
        });
        this._orderWatcher = new order_watcher_1.OrderWatcher(provider, config_1.NETWORK_ID);
        this._orderWatcher.subscribe(this.onOrderStateChangeCallback.bind(this));
        utils_1.intervalUtils.setAsyncExcludingInterval(this.onCleanUpInvalidOrdersAsync.bind(this), config_1.PERMANENT_CLEANUP_INTERVAL_MS, utils_2.utils.log);
    }
    onOrderStateChangeCallback(err, orderState) {
        if (err !== null) {
            utils_2.utils.log(err);
        }
        else {
            const state = orderState;
            if (!state.isValid) {
                this._shadowedOrders.set(state.orderHash, Date.now());
            }
            else {
                this._shadowedOrders.delete(state.orderHash);
            }
        }
    }
    async onCleanUpInvalidOrdersAsync() {
        const permanentlyExpiredOrders = [];
        for (const [orderHash, shadowedAt] of this._shadowedOrders) {
            const now = Date.now();
            if (shadowedAt + config_1.ORDER_SHADOWING_MARGIN_MS < now) {
                permanentlyExpiredOrders.push(orderHash);
                this._shadowedOrders.delete(orderHash); // we need to remove this order so we don't keep shadowing it
                //@ts-ignore
                this._orderWatcher.removeOrder(orderHash); // also remove from order watcher to avoid more callbacks
            }
        }
        if (!_.isEmpty(permanentlyExpiredOrders)) {
            const connection = db_connection_1.getDBConnection();
            await connection.manager.delete(SignedOrderModel_1.SignedOrderModel, permanentlyExpiredOrders);
        }
    }
    async addOrderAsync(signedOrder) {
        const connection = db_connection_1.getDBConnection();
        // Validate transfers to a non 0 default address. Some tokens cannot be transferred to
        // the null address (default)
        //@ts-ignore
        await this._contractWrappers.exchange.validateOrderFillableOrThrowAsync(signedOrder, {
            simulationTakerAddress: config_1.DEFAULT_TAKER_SIMULATION_ADDRESS,
        });
        //@ts-ignore
        await this._orderWatcher.addOrderAsync(signedOrder);
        const signedOrderModel = serializeOrder(signedOrder);
        await connection.manager.save(signedOrderModel);
    }
    async getOrderBookAsync(page, perPage, baseAssetData, quoteAssetData) {
        const connection = db_connection_1.getDBConnection();
        const bidSignedOrderModels = (await connection.manager.find(SignedOrderModel_1.SignedOrderModel, {
            where: { takerAssetData: baseAssetData, makerAssetData: quoteAssetData },
        }));
        const askSignedOrderModels = (await connection.manager.find(SignedOrderModel_1.SignedOrderModel, {
            where: { takerAssetData: quoteAssetData, makerAssetData: baseAssetData },
        }));
        const bidApiOrders = bidSignedOrderModels
            .map(deserializeOrder)
            .filter(order => !this._shadowedOrders.has(_0x_js_1.orderHashUtils.getOrderHashHex(order)))
            .sort((orderA, orderB) => compareBidOrder(orderA, orderB))
            .map(signedOrder => ({ metaData: {}, order: signedOrder }));
        const askApiOrders = askSignedOrderModels
            .map(deserializeOrder)
            .filter(order => !this._shadowedOrders.has(_0x_js_1.orderHashUtils.getOrderHashHex(order)))
            .sort((orderA, orderB) => compareAskOrder(orderA, orderB))
            .map(signedOrder => ({ metaData: {}, order: signedOrder }));
        const paginatedBidApiOrders = paginator_1.paginate(bidApiOrders, page, perPage);
        const paginatedAskApiOrders = paginator_1.paginate(askApiOrders, page, perPage);
        return {
            bids: paginatedBidApiOrders,
            asks: paginatedAskApiOrders,
        };
    }
    // TODO:(leo) Do all filtering and pagination in a DB (requires stored procedures or redundant fields)
    async getOrdersAsync(page, perPage, ordersFilterParams) {
        const connection = db_connection_1.getDBConnection();
        // Pre-filters
        const filterObjectWithValuesIfExist = {
            exchangeAddress: ordersFilterParams.exchangeAddress,
            senderAddress: ordersFilterParams.senderAddress,
            makerAssetData: ordersFilterParams.makerAssetData,
            takerAssetData: ordersFilterParams.takerAssetData,
            makerAddress: ordersFilterParams.makerAddress,
            takerAddress: ordersFilterParams.takerAddress,
            feeRecipientAddress: ordersFilterParams.feeRecipientAddress,
        };
        const filterObject = _.pickBy(filterObjectWithValuesIfExist, _.identity.bind(_));
        const signedOrderModels = (await connection.manager.find(SignedOrderModel_1.SignedOrderModel, { where: filterObject }));
        let signedOrders = _.map(signedOrderModels, deserializeOrder);
        // Post-filters
        signedOrders = signedOrders
            .filter(order => !this._shadowedOrders.has(_0x_js_1.orderHashUtils.getOrderHashHex(order)))
            .filter(
        // traderAddress
        signedOrder => ordersFilterParams.traderAddress === undefined ||
            signedOrder.makerAddress === ordersFilterParams.traderAddress ||
            signedOrder.takerAddress === ordersFilterParams.traderAddress)
            .filter(
        // makerAssetAddress
        signedOrder => ordersFilterParams.makerAssetAddress === undefined ||
            includesTokenAddress(signedOrder.makerAssetData, ordersFilterParams.makerAssetAddress))
            .filter(
        // takerAssetAddress
        signedOrder => ordersFilterParams.takerAssetAddress === undefined ||
            includesTokenAddress(signedOrder.takerAssetData, ordersFilterParams.takerAssetAddress))
            .filter(
        // makerAssetProxyId
        signedOrder => ordersFilterParams.makerAssetProxyId === undefined ||
            _0x_js_1.assetDataUtils.decodeAssetDataOrThrow(signedOrder.makerAssetData).assetProxyId ===
                ordersFilterParams.makerAssetProxyId)
            .filter(
        // makerAssetProxyId
        signedOrder => ordersFilterParams.takerAssetProxyId === undefined ||
            _0x_js_1.assetDataUtils.decodeAssetDataOrThrow(signedOrder.takerAssetData).assetProxyId ===
                ordersFilterParams.takerAssetProxyId);
        const apiOrders = signedOrders.map(signedOrder => ({ metaData: {}, order: signedOrder }));
        const paginatedApiOrders = paginator_1.paginate(apiOrders, page, perPage);
        return paginatedApiOrders;
    }
    async addExistingOrdersToOrderWatcherAsync() {
        const connection = db_connection_1.getDBConnection();
        const signedOrderModels = (await connection.manager.find(SignedOrderModel_1.SignedOrderModel));
        const signedOrders = signedOrderModels.map(deserializeOrder);
        for (const signedOrder of signedOrders) {
            try {
                //@ts-ignore
                await this._contractWrappers.exchange.validateOrderFillableOrThrowAsync(signedOrder, {
                    simulationTakerAddress: config_1.DEFAULT_TAKER_SIMULATION_ADDRESS,
                });
                //@ts-ignore
                await this._orderWatcher.addOrderAsync(signedOrder);
            }
            catch (err) {
                const orderHash = _0x_js_1.orderHashUtils.getOrderHashHex(signedOrder);
                await connection.manager.delete(SignedOrderModel_1.SignedOrderModel, orderHash);
            }
        }
    }
}
exports.OrderBook = OrderBook;
const compareAskOrder = (orderA, orderB) => {
    const orderAPrice = orderA.takerAssetAmount.div(orderA.makerAssetAmount);
    const orderBPrice = orderB.takerAssetAmount.div(orderB.makerAssetAmount);
    if (!orderAPrice.isEqualTo(orderBPrice)) {
        return orderAPrice.comparedTo(orderBPrice);
    }
    return compareOrderByFeeRatio(orderA, orderB);
};
const compareBidOrder = (orderA, orderB) => {
    const orderAPrice = orderA.makerAssetAmount.div(orderA.takerAssetAmount);
    const orderBPrice = orderB.makerAssetAmount.div(orderB.takerAssetAmount);
    if (!orderAPrice.isEqualTo(orderBPrice)) {
        return orderBPrice.comparedTo(orderAPrice);
    }
    return compareOrderByFeeRatio(orderA, orderB);
};
const compareOrderByFeeRatio = (orderA, orderB) => {
    const orderAFeePrice = orderA.takerFee.div(orderA.takerAssetAmount);
    const orderBFeePrice = orderB.takerFee.div(orderB.takerAssetAmount);
    if (!orderAFeePrice.isEqualTo(orderBFeePrice)) {
        return orderBFeePrice.comparedTo(orderAFeePrice);
    }
    return orderA.expirationTimeSeconds.comparedTo(orderB.expirationTimeSeconds);
};
const includesTokenAddress = (assetData, tokenAddress) => {
    const decodedAssetData = _0x_js_1.assetDataUtils.decodeAssetDataOrThrow(assetData);
    if (_0x_js_1.assetDataUtils.isMultiAssetData(decodedAssetData)) {
        for (const [, nestedAssetDataElement] of decodedAssetData.nestedAssetData.entries()) {
            if (includesTokenAddress(nestedAssetDataElement, tokenAddress)) {
                return true;
            }
        }
        return false;
    }
    else if (!_0x_js_1.assetDataUtils.isStaticCallAssetData(decodedAssetData)) {
        return decodedAssetData.tokenAddress === tokenAddress;
    }
    return false;
};
const deserializeOrder = (signedOrderModel) => {
    const signedOrder = {
        signature: signedOrderModel.signature,
        senderAddress: signedOrderModel.senderAddress,
        makerAddress: signedOrderModel.makerAddress,
        takerAddress: signedOrderModel.takerAddress,
        makerFee: new _0x_js_1.BigNumber(signedOrderModel.makerFee),
        takerFee: new _0x_js_1.BigNumber(signedOrderModel.takerFee),
        makerAssetAmount: new _0x_js_1.BigNumber(signedOrderModel.makerAssetAmount),
        takerAssetAmount: new _0x_js_1.BigNumber(signedOrderModel.takerAssetAmount),
        makerAssetData: signedOrderModel.makerAssetData,
        takerAssetData: signedOrderModel.takerAssetData,
        salt: new _0x_js_1.BigNumber(signedOrderModel.salt),
        exchangeAddress: signedOrderModel.exchangeAddress,
        feeRecipientAddress: signedOrderModel.feeRecipientAddress,
        expirationTimeSeconds: new _0x_js_1.BigNumber(signedOrderModel.expirationTimeSeconds),
    };
    return signedOrder;
};
const serializeOrder = (signedOrder) => {
    const signedOrderModel = new SignedOrderModel_1.SignedOrderModel({
        signature: signedOrder.signature,
        senderAddress: signedOrder.senderAddress,
        makerAddress: signedOrder.makerAddress,
        takerAddress: signedOrder.takerAddress,
        makerFee: signedOrder.makerFee.toString(),
        takerFee: signedOrder.takerFee.toString(),
        makerAssetAmount: signedOrder.makerAssetAmount.toString(),
        takerAssetAmount: signedOrder.takerAssetAmount.toString(),
        makerAssetData: signedOrder.makerAssetData,
        takerAssetData: signedOrder.takerAssetData,
        salt: signedOrder.salt.toString(),
        exchangeAddress: signedOrder.exchangeAddress,
        feeRecipientAddress: signedOrder.feeRecipientAddress,
        expirationTimeSeconds: signedOrder.expirationTimeSeconds.toNumber(),
        hash: _0x_js_1.orderHashUtils.getOrderHashHex(signedOrder),
    });
    return signedOrderModel;
};
