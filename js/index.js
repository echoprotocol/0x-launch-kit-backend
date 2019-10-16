'use strict';
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
var _this = this;
Object.defineProperty(exports, '__esModule', { value: true });
var bodyParser = require('body-parser');
var cors = require('cors');
var express = require('express');
var asyncHandler = require('express-async-handler');
require('reflect-metadata');
var config = require('./config');
var db_connection_1 = require('./db_connection');
var handlers_1 = require('./handlers');
var error_handling_1 = require('./middleware/error_handling');
var url_params_parsing_1 = require('./middleware/url_params_parsing');
var read_only_orderbook_1 = require('./orderbooks/read_only_orderbook');
var write_orderbook_1 = require('./orderbooks/write_orderbook');
var utils_1 = require('./utils');
var websocket_sra_1 = require('./websocket_sra');
(function() {
    return __awaiter(_this, void 0, void 0, function() {
        var app, server, orderBook, handlers;
        return __generator(this, function(_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, db_connection_1.initDBConnectionAsync()];
                case 1:
                    _a.sent();
                    app = express();
                    server = app.listen(config.HTTP_PORT, function() {
                        utils_1.utils.log(
                            'Standard relayer API (HTTP) listening on port ' +
                                config.HTTP_PORT +
                                '!\nConfig: ' +
                                JSON.stringify(config, null, 2),
                        );
                    });
                    if (!!config.READ_ONLY) return [3 /*break*/, 3];
                    orderBook = new write_orderbook_1.OrderBook(new websocket_sra_1.WebsocketSRA(server));
                    return [4 /*yield*/, orderBook.syncOrderbookAsync()];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    orderBook = new read_only_orderbook_1.ReadOnlyOrderBook();
                    _a.label = 4;
                case 4:
                    handlers = new handlers_1.Handlers(orderBook);
                    app.use(cors());
                    app.use(bodyParser.json());
                    app.use(url_params_parsing_1.urlParamsParsing);
                    /**
                     * GET AssetPairs endpoint retrieves a list of available asset pairs and the information required to trade them.
                     * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/getAssetPairs
                     */
                    app.get(
                        '/v3/asset_pairs',
                        asyncHandler(handlers_1.Handlers.assetPairsAsync.bind(handlers_1.Handlers)),
                    );
                    /**
                     * GET Orders endpoint retrieves a list of orders given query parameters.
                     * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/getOrders
                     */
                    app.get('/v3/orders', asyncHandler(handlers.ordersAsync.bind(handlers)));
                    /**
                     * GET Orderbook endpoint retrieves the orderbook for a given asset pair.
                     * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/getOrderbook
                     */
                    app.get('/v3/orderbook', asyncHandler(handlers.orderbookAsync.bind(handlers)));
                    /**
                     * GET FeeRecepients endpoint retrieves a collection of all fee recipient addresses for a relayer.
                     * http://sra-spec.s3-website-us-east-1.amazonaws.com/v3/fee_recipients
                     */
                    app.get('/v3/fee_recipients', handlers_1.Handlers.feeRecipients.bind(handlers_1.Handlers));
                    if (!config.DISABLE_POST) {
                        /**
                         * POST Order config endpoint retrives the values for order fields that the relayer requires.
                         * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/getOrderConfig
                         */
                        app.post('/v3/order_config', handlers_1.Handlers.orderConfig.bind(handlers_1.Handlers));
                        /**
                         * POST Order endpoint submits an order to the Relayer.
                         * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/postOrder
                         */
                        app.post('/v3/order', asyncHandler(handlers.postOrderAsync.bind(handlers)));
                    }
                    /**
                     * GET Order endpoint retrieves the order by order hash.
                     * http://sra-spec.s3-website-us-east-1.amazonaws.com/#operation/getOrder
                     */
                    app.get(
                        '/v3/order/:orderHash',
                        asyncHandler(handlers_1.Handlers.getOrderByHashAsync.bind(handlers_1.Handlers)),
                    );
                    app.use(error_handling_1.errorHandler);
                    return [2 /*return*/];
            }
        });
    });
})().catch(utils_1.utils.log);
