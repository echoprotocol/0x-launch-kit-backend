import { BigNumber, SignedOrder } from '0x.js';
import {
    AcceptedOrderInfo,
    OrderEvent,
    OrderEventEndState,
    OrderInfo,
    RejectedCode,
    RejectedOrderInfo,
    ValidationResults,
    WSClient,
} from '@0x/mesh-rpc-client';
import * as _ from 'lodash';

import { MESH_ENDPOINT } from '../config';
import { ValidationErrorCodes } from '../errors';
import { AcceptedRejectedResults, APIOrderWithMetaData, onOrdersUpdateCallback } from '../types';
import { utils } from '../utils';

// tslint:disable-next-line:no-var-requires
const d = require('debug')('MESH');

const ZERO = new BigNumber(0);
const ADD_ORDER_BATCH_SIZE = 100;

export class MeshAdapter {
    private readonly _wsClient: WSClient;
    private readonly _listeners = {
        added: new Set<onOrdersUpdateCallback>(),
        updated: new Set<onOrdersUpdateCallback>(),
        removed: new Set<onOrdersUpdateCallback>(),
    };
    public static orderInfoToAPIOrder(
        orderEvent: OrderEvent | AcceptedOrderInfo | RejectedOrderInfo | OrderInfo,
    ): APIOrderWithMetaData {
        const remainingFillableTakerAssetAmount = (orderEvent as OrderEvent).fillableTakerAssetAmount
            ? (orderEvent as OrderEvent).fillableTakerAssetAmount
            : ZERO;
        return {
            order: orderEvent.signedOrder,
            metaData: {
                orderHash: orderEvent.orderHash,
                remainingFillableTakerAssetAmount,
            },
        };
    }
    public static meshRejectedCodeToSRACode(code: RejectedCode): ValidationErrorCodes {
        switch (code) {
            case RejectedCode.OrderCancelled:
            case RejectedCode.OrderExpired:
            case RejectedCode.OrderUnfunded:
            case RejectedCode.OrderHasInvalidMakerAssetAmount:
            case RejectedCode.OrderHasInvalidMakerAssetData:
            case RejectedCode.OrderHasInvalidTakerAssetAmount:
            case RejectedCode.OrderHasInvalidTakerAssetData:
            case RejectedCode.OrderFullyFilled: {
                return ValidationErrorCodes.InvalidOrder;
            }
            case RejectedCode.OrderHasInvalidSignature: {
                return ValidationErrorCodes.InvalidSignatureOrHash;
            }
            case RejectedCode.OrderForIncorrectNetwork: {
                return ValidationErrorCodes.InvalidAddress;
            }
            default:
                return ValidationErrorCodes.InternalError;
        }
    }
    private static _calculateAddOrRemove(
        orderEvents: OrderEvent[],
    ): { added: APIOrderWithMetaData[]; removed: APIOrderWithMetaData[]; updated: APIOrderWithMetaData[] } {
        const added = [];
        const removed = [];
        const updated = [];
        for (const event of orderEvents) {
            const apiOrder = MeshAdapter.orderInfoToAPIOrder(event);
            switch (event.endState) {
                case OrderEventEndState.Added: {
                    added.push(apiOrder);
                    break;
                }
                case OrderEventEndState.Cancelled:
                case OrderEventEndState.Expired:
                case OrderEventEndState.FullyFilled:
                case OrderEventEndState.Unfunded: {
                    removed.push(apiOrder);
                    break;
                }
                case OrderEventEndState.FillabilityIncreased:
                case OrderEventEndState.Filled: {
                    updated.push(apiOrder);
                    break;
                }
                default:
                    d('Unknown Event', event.endState, event);
                    break;
            }
        }
        return { added, removed, updated };
    }
    constructor() {
        this._wsClient = new WSClient(MESH_ENDPOINT);
        this._wsClient.subscribeToOrdersAsync(orderEvents => {
            const { added, updated, removed } = MeshAdapter._calculateAddOrRemove(orderEvents);
            if (added.length > 0) {
                for (const cb of this._listeners.added) {
                    cb(added);
                }
            }
            if (removed.length > 0) {
                for (const cb of this._listeners.removed) {
                    cb(removed);
                }
            }
            if (updated.length > 0) {
                for (const cb of this._listeners.updated) {
                    cb(updated);
                }
            }
        });
    }
    public async addOrdersAsync(orders: SignedOrder[]): Promise<AcceptedRejectedResults> {
        if (orders.length === 0) {
            const validationResults = { accepted: [], rejected: [] };
            return validationResults;
        }
        const { accepted, rejected } = await this._submitOrdersToMeshAsync(orders);
        return { accepted, rejected };
    }
    // tslint:disable-next-line:async-suffix
    public async onOrdersAdded(cb: onOrdersUpdateCallback): Promise<void> {
        this._listeners.added.add(cb);
    }
    // tslint:disable-next-line:async-suffix
    public async onOrdersUpdated(cb: onOrdersUpdateCallback): Promise<void> {
        this._listeners.updated.add(cb);
    }
    // tslint:disable-next-line:async-suffix
    public async onOrdersRemoved(cb: onOrdersUpdateCallback): Promise<void> {
        this._listeners.removed.add(cb);
    }
    public onReconnected(cb: () => void): void {
        this._wsClient.onReconnected(() => cb());
    }
    public async getOrdersAsync(): Promise<OrderInfo[]> {
        const orders = await utils.attemptAsync(() => this._wsClient.getOrdersAsync());
        return orders;
    }
    private async _submitOrdersToMeshAsync(signedOrders: SignedOrder[]): Promise<ValidationResults> {
        const chunks = _.chunk(signedOrders, ADD_ORDER_BATCH_SIZE);
        let allValidationResults: ValidationResults = { accepted: [], rejected: [] };
        for (const chunk of chunks) {
            d('MESH SEND', chunk.length);
            const validationResults = await utils.attemptAsync(() => this._wsClient.addOrdersAsync(chunk));
            allValidationResults = {
                accepted: [...allValidationResults.accepted, ...validationResults.accepted],
                rejected: [...allValidationResults.rejected, ...validationResults.rejected],
            };
        }
        return allValidationResults;
    }
}
