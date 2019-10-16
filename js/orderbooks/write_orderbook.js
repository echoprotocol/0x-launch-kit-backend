'use strict';
var __extends =
    (this && this.__extends) ||
    (function() {
        var extendStatics = function(d, b) {
            extendStatics =
                Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array &&
                    function(d, b) {
                        d.__proto__ = b;
                    }) ||
                function(d, b) {
                    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
                };
            return extendStatics(d, b);
        };
        return function(d, b) {
            extendStatics(d, b);
            function __() {
                this.constructor = d;
            }
            d.prototype = b === null ? Object.create(b) : ((__.prototype = b.prototype), new __());
        };
    })();
var __awaiter =
    (this && this.__awaiter) ||
    function(thisArg, _arguments, P, generator) {
        return new (P || (P = Promise))(function(resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : new P(function(resolve) {
                          resolve(result.value);
                      }).then(fulfilled, rejected);
            }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
var __generator =
    (this && this.__generator) ||
    function(thisArg, body) {
        var _ = {
                label: 0,
                sent: function() {
                    if (t[0] & 1) throw t[1];
                    return t[1];
                },
                trys: [],
                ops: [],
            },
            f,
            y,
            t,
            g;
        return (
            (g = { next: verb(0), throw: verb(1), return: verb(2) }),
            typeof Symbol === 'function' &&
                (g[Symbol.iterator] = function() {
                    return this;
                }),
            g
        );
        function verb(n) {
            return function(v) {
                return step([n, v]);
            };
        }
        function step(op) {
            if (f) throw new TypeError('Generator is already executing.');
            while (_)
                try {
                    if (
                        ((f = 1),
                        y &&
                            (t =
                                op[0] & 2
                                    ? y['return']
                                    : op[0]
                                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                                    : y.next) &&
                            !(t = t.call(y, op[1])).done)
                    )
                        return t;
                    if (((y = 0), t)) op = [op[0] & 2, t.value];
                    switch (op[0]) {
                        case 0:
                        case 1:
                            t = op;
                            break;
                        case 4:
                            _.label++;
                            return { value: op[1], done: false };
                        case 5:
                            _.label++;
                            y = op[1];
                            op = [0];
                            continue;
                        case 7:
                            op = _.ops.pop();
                            _.trys.pop();
                            continue;
                        default:
                            if (
                                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                                (op[0] === 6 || op[0] === 2)
                            ) {
                                _ = 0;
                                continue;
                            }
                            if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                                _.label = op[1];
                                break;
                            }
                            if (op[0] === 6 && _.label < t[1]) {
                                _.label = t[1];
                                t = op;
                                break;
                            }
                            if (t && _.label < t[2]) {
                                _.label = t[2];
                                _.ops.push(op);
                                break;
                            }
                            if (t[2]) _.ops.pop();
                            _.trys.pop();
                            continue;
                    }
                    op = body.call(thisArg, _);
                } catch (e) {
                    op = [6, e];
                    y = 0;
                } finally {
                    f = t = 0;
                }
            if (op[0] & 5) throw op[1];
            return { value: op[0] ? op[1] : void 0, done: true };
        }
    };
Object.defineProperty(exports, '__esModule', { value: true });
var _ = require('lodash');
var db_connection_1 = require('../db_connection');
var errors_1 = require('../errors');
var SignedOrderModel_1 = require('../models/SignedOrderModel');
var mesh_adapter_1 = require('../order_watchers/mesh_adapter');
var paginator_1 = require('../paginator');
var types_1 = require('../types');
var orderbook_utils_1 = require('./orderbook_utils');
var read_only_orderbook_1 = require('./read_only_orderbook');
// tslint:disable-next-line:no-var-requires
var d = require('debug')('orderbook');
var OrderBook = /** @class */ (function(_super) {
    __extends(OrderBook, _super);
    function OrderBook(websocketSRA) {
        var _this = _super.call(this) || this;
        _this._websocketSRA = websocketSRA;
        _this._orderWatcher = new mesh_adapter_1.MeshAdapter();
        _this._orderWatcher.onOrdersAdded(function(orders) {
            return __awaiter(_this, void 0, void 0, function() {
                return __generator(this, function(_a) {
                    return [
                        2 /*return*/,
                        this._onOrderLifeCycleEventAsync(types_1.OrderWatcherLifeCycleEvents.Added, orders),
                    ];
                });
            });
        });
        _this._orderWatcher.onOrdersRemoved(function(orders) {
            return __awaiter(_this, void 0, void 0, function() {
                return __generator(this, function(_a) {
                    return [
                        2 /*return*/,
                        this._onOrderLifeCycleEventAsync(types_1.OrderWatcherLifeCycleEvents.Removed, orders),
                    ];
                });
            });
        });
        _this._orderWatcher.onOrdersUpdated(function(orders) {
            return __awaiter(_this, void 0, void 0, function() {
                return __generator(this, function(_a) {
                    return [
                        2 /*return*/,
                        this._onOrderLifeCycleEventAsync(types_1.OrderWatcherLifeCycleEvents.Updated, orders),
                    ];
                });
            });
        });
        _this._orderWatcher.onReconnected(function() {
            return __awaiter(_this, void 0, void 0, function() {
                return __generator(this, function(_a) {
                    switch (_a.label) {
                        case 0:
                            d('Reconnecting to orderwatcher');
                            return [4 /*yield*/, this.syncOrderbookAsync()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        return _this;
    }
    OrderBook.getOrderByHashIfExistsAsync = function(orderHash) {
        return __awaiter(this, void 0, void 0, function() {
            var connection, signedOrderModelIfExists, deserializedOrder;
            return __generator(this, function(_a) {
                switch (_a.label) {
                    case 0:
                        connection = db_connection_1.getDBConnection();
                        return [
                            4 /*yield*/,
                            connection.manager.findOne(SignedOrderModel_1.SignedOrderModel, orderHash),
                        ];
                    case 1:
                        signedOrderModelIfExists = _a.sent();
                        if (signedOrderModelIfExists === undefined) {
                            return [2 /*return*/, undefined];
                        } else {
                            deserializedOrder = orderbook_utils_1.deserializeOrderToAPIOrder(signedOrderModelIfExists);
                            return [2 /*return*/, deserializedOrder];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    OrderBook.getAssetPairsAsync = function(page, perPage, assetDataA, assetDataB) {
        return __awaiter(this, void 0, void 0, function() {
            var connection,
                signedOrderModels,
                assetPairsItems,
                nonPaginatedFilteredAssetPairs,
                containsAssetDataAAndAssetDataB,
                assetData_1,
                containsAssetData,
                uniqueNonPaginatedFilteredAssetPairs,
                paginatedFilteredAssetPairs;
            return __generator(this, function(_a) {
                switch (_a.label) {
                    case 0:
                        connection = db_connection_1.getDBConnection();
                        return [4 /*yield*/, connection.manager.find(SignedOrderModel_1.SignedOrderModel)];
                    case 1:
                        signedOrderModels = _a.sent();
                        assetPairsItems = signedOrderModels
                            .map(orderbook_utils_1.deserializeOrder)
                            .map(orderbook_utils_1.signedOrderToAssetPair);
                        if (assetDataA === undefined && assetDataB === undefined) {
                            nonPaginatedFilteredAssetPairs = assetPairsItems;
                        } else if (assetDataA !== undefined && assetDataB !== undefined) {
                            containsAssetDataAAndAssetDataB = function(assetPair) {
                                return (
                                    (assetPair.assetDataA.assetData === assetDataA &&
                                        assetPair.assetDataB.assetData === assetDataB) ||
                                    (assetPair.assetDataA.assetData === assetDataB &&
                                        assetPair.assetDataB.assetData === assetDataA)
                                );
                            };
                            nonPaginatedFilteredAssetPairs = assetPairsItems.filter(containsAssetDataAAndAssetDataB);
                        } else {
                            assetData_1 = assetDataA || assetDataB;
                            containsAssetData = function(assetPair) {
                                return (
                                    assetPair.assetDataA.assetData === assetData_1 ||
                                    assetPair.assetDataB.assetData === assetData_1
                                );
                            };
                            nonPaginatedFilteredAssetPairs = assetPairsItems.filter(containsAssetData);
                        }
                        uniqueNonPaginatedFilteredAssetPairs = _.uniqWith(
                            nonPaginatedFilteredAssetPairs,
                            _.isEqual.bind(_),
                        );
                        paginatedFilteredAssetPairs = paginator_1.paginate(
                            uniqueNonPaginatedFilteredAssetPairs,
                            page,
                            perPage,
                        );
                        return [2 /*return*/, paginatedFilteredAssetPairs];
                }
            });
        });
    };
    OrderBook.prototype.addOrderAsync = function(signedOrder) {
        return __awaiter(this, void 0, void 0, function() {
            var rejected;
            return __generator(this, function(_a) {
                switch (_a.label) {
                    case 0:
                        return [4 /*yield*/, this._orderWatcher.addOrdersAsync([signedOrder])];
                    case 1:
                        rejected = _a.sent().rejected;
                        if (rejected.length !== 0) {
                            throw new errors_1.ValidationError([
                                {
                                    field: 'signedOrder',
                                    code: mesh_adapter_1.MeshAdapter.meshRejectedCodeToSRACode(rejected[0].status.code),
                                    reason: rejected[0].status.code + ': ' + rejected[0].status.message,
                                },
                            ]);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    OrderBook.prototype.syncOrderbookAsync = function() {
        return __awaiter(this, void 0, void 0, function() {
            var connection, signedOrderModels, signedOrders, getOrdersPromise, _a, accepted, rejected, orders;
            return __generator(this, function(_b) {
                switch (_b.label) {
                    case 0:
                        connection = db_connection_1.getDBConnection();
                        return [4 /*yield*/, connection.manager.find(SignedOrderModel_1.SignedOrderModel)];
                    case 1:
                        signedOrderModels = _b.sent();
                        signedOrders = signedOrderModels.map(orderbook_utils_1.deserializeOrder);
                        getOrdersPromise = this._orderWatcher.getOrdersAsync();
                        return [4 /*yield*/, this._orderWatcher.addOrdersAsync(signedOrders)];
                    case 2:
                        (_a = _b.sent()), (accepted = _a.accepted), (rejected = _a.rejected);
                        d(
                            'SYNC ' +
                                rejected.length +
                                ' rejected ' +
                                accepted.length +
                                ' accepted. ' +
                                (rejected.length + accepted.length) +
                                ' total, ' +
                                signedOrders.length +
                                ' sent',
                        );
                        if (!(rejected.length > 0)) return [3 /*break*/, 4];
                        return [
                            4 /*yield*/,
                            this._onOrderLifeCycleEventAsync(
                                types_1.OrderWatcherLifeCycleEvents.Removed,
                                rejected.map(function(r) {
                                    return mesh_adapter_1.MeshAdapter.orderInfoToAPIOrder(r);
                                }),
                            ),
                        ];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        return [4 /*yield*/, getOrdersPromise];
                    case 5:
                        orders = _b.sent();
                        if (!(orders.length > 0)) return [3 /*break*/, 7];
                        return [
                            4 /*yield*/,
                            this._onOrderLifeCycleEventAsync(
                                types_1.OrderWatcherLifeCycleEvents.Added,
                                orders.map(function(o) {
                                    return mesh_adapter_1.MeshAdapter.orderInfoToAPIOrder(o);
                                }),
                            ),
                        ];
                    case 6:
                        _b.sent();
                        _b.label = 7;
                    case 7:
                        return [2 /*return*/];
                }
            });
        });
    };
    OrderBook.prototype._onOrderLifeCycleEventAsync = function(lifecycleEvent, orders) {
        return __awaiter(this, void 0, void 0, function() {
            var connection, _a, signedOrdersModel, orderHashes;
            return __generator(this, function(_b) {
                switch (_b.label) {
                    case 0:
                        connection = db_connection_1.getDBConnection();
                        _a = lifecycleEvent;
                        switch (_a) {
                            case types_1.OrderWatcherLifeCycleEvents.Updated:
                                return [3 /*break*/, 1];
                            case types_1.OrderWatcherLifeCycleEvents.Added:
                                return [3 /*break*/, 1];
                            case types_1.OrderWatcherLifeCycleEvents.Removed:
                                return [3 /*break*/, 3];
                        }
                        return [3 /*break*/, 5];
                    case 1:
                        signedOrdersModel = orders.map(function(o) {
                            return orderbook_utils_1.serializeOrder(o);
                        });
                        return [4 /*yield*/, connection.manager.save(signedOrdersModel)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 3:
                        orderHashes = orders.map(function(o) {
                            return o.metaData.orderHash;
                        });
                        return [
                            4 /*yield*/,
                            connection.manager.delete(SignedOrderModel_1.SignedOrderModel, orderHashes),
                        ];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        this._websocketSRA.orderUpdate(orders);
                        return [2 /*return*/];
                }
            });
        });
    };
    return OrderBook;
})(read_only_orderbook_1.ReadOnlyOrderBook);
exports.OrderBook = OrderBook;
