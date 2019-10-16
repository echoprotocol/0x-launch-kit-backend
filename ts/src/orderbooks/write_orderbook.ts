import { SignedOrder } from '0x.js';
import { APIOrder, PaginatedCollection } from '@0x/connect';
import { AssetPairsItem } from '@0x/types';
import * as _ from 'lodash';

import { getDBConnection } from '../db_connection';
import { ValidationError } from '../errors';
import { SignedOrderModel } from '../models/SignedOrderModel';
import { MeshAdapter } from '../order_watchers/mesh_adapter';
import { paginate } from '../paginator';
import { APIOrderWithMetaData, OrderWatcherLifeCycleEvents } from '../types';
import { WebsocketSRA } from '../websocket_sra';

import {
    deserializeOrder,
    deserializeOrderToAPIOrder,
    serializeOrder,
    signedOrderToAssetPair,
} from './orderbook_utils';
import { ReadOnlyOrderBook } from './read_only_orderbook';

// tslint:disable-next-line:no-var-requires
const d = require('debug')('orderbook');

export class OrderBook extends ReadOnlyOrderBook {
    private readonly _websocketSRA: WebsocketSRA;
    private readonly _orderWatcher: MeshAdapter;
    public static async getOrderByHashIfExistsAsync(orderHash: string): Promise<APIOrder | undefined> {
        const connection = getDBConnection();
        const signedOrderModelIfExists = await connection.manager.findOne(SignedOrderModel, orderHash);
        if (signedOrderModelIfExists === undefined) {
            return undefined;
        } else {
            const deserializedOrder = deserializeOrderToAPIOrder(signedOrderModelIfExists as Required<
                SignedOrderModel
            >);
            return deserializedOrder;
        }
    }
    public static async getAssetPairsAsync(
        page: number,
        perPage: number,
        assetDataA: string,
        assetDataB: string,
    ): Promise<PaginatedCollection<AssetPairsItem>> {
        const connection = getDBConnection();
        const signedOrderModels = (await connection.manager.find(SignedOrderModel)) as Array<
            Required<SignedOrderModel>
        >;

        const assetPairsItems: AssetPairsItem[] = signedOrderModels.map(deserializeOrder).map(signedOrderToAssetPair);
        let nonPaginatedFilteredAssetPairs: AssetPairsItem[];
        if (assetDataA === undefined && assetDataB === undefined) {
            nonPaginatedFilteredAssetPairs = assetPairsItems;
        } else if (assetDataA !== undefined && assetDataB !== undefined) {
            const containsAssetDataAAndAssetDataB = (assetPair: AssetPairsItem) =>
                (assetPair.assetDataA.assetData === assetDataA && assetPair.assetDataB.assetData === assetDataB) ||
                (assetPair.assetDataA.assetData === assetDataB && assetPair.assetDataB.assetData === assetDataA);
            nonPaginatedFilteredAssetPairs = assetPairsItems.filter(containsAssetDataAAndAssetDataB);
        } else {
            const assetData = assetDataA || assetDataB;
            const containsAssetData = (assetPair: AssetPairsItem) =>
                assetPair.assetDataA.assetData === assetData || assetPair.assetDataB.assetData === assetData;
            nonPaginatedFilteredAssetPairs = assetPairsItems.filter(containsAssetData);
        }
        const uniqueNonPaginatedFilteredAssetPairs = _.uniqWith(nonPaginatedFilteredAssetPairs, _.isEqual.bind(_));
        const paginatedFilteredAssetPairs = paginate(uniqueNonPaginatedFilteredAssetPairs, page, perPage);
        return paginatedFilteredAssetPairs;
    }
    constructor(websocketSRA: WebsocketSRA) {
        super();
        this._websocketSRA = websocketSRA;
        this._orderWatcher = new MeshAdapter();
        this._orderWatcher.onOrdersAdded(async orders =>
            this._onOrderLifeCycleEventAsync(OrderWatcherLifeCycleEvents.Added, orders),
        );
        this._orderWatcher.onOrdersRemoved(async orders =>
            this._onOrderLifeCycleEventAsync(OrderWatcherLifeCycleEvents.Removed, orders),
        );
        this._orderWatcher.onOrdersUpdated(async orders =>
            this._onOrderLifeCycleEventAsync(OrderWatcherLifeCycleEvents.Updated, orders),
        );
        this._orderWatcher.onReconnected(async () => {
            d('Reconnecting to orderwatcher');
            await this.syncOrderbookAsync();
        });
    }
    public async addOrderAsync(signedOrder: SignedOrder): Promise<void> {
        const { rejected } = await this._orderWatcher.addOrdersAsync([signedOrder]);
        if (rejected.length !== 0) {
            throw new ValidationError([
                {
                    field: 'signedOrder',
                    code: MeshAdapter.meshRejectedCodeToSRACode(rejected[0].status.code),
                    reason: `${rejected[0].status.code}: ${rejected[0].status.message}`,
                },
            ]);
        }
        // Mesh will call back when the order is added
    }
    public async syncOrderbookAsync(): Promise<void> {
        const connection = getDBConnection();
        const signedOrderModels = (await connection.manager.find(SignedOrderModel)) as Array<
            Required<SignedOrderModel>
        >;
        const signedOrders = signedOrderModels.map(deserializeOrder);
        // Sync the order watching service state locally
        const getOrdersPromise = this._orderWatcher.getOrdersAsync();
        // Validate the local state and notify the order watcher of any missed orders
        const { accepted, rejected } = await this._orderWatcher.addOrdersAsync(signedOrders);
        d(
            `SYNC ${rejected.length} rejected ${accepted.length} accepted. ${rejected.length +
                accepted.length} total, ${signedOrders.length} sent`,
        );
        // Remove all of the rejected orders
        if (rejected.length > 0) {
            await this._onOrderLifeCycleEventAsync(
                OrderWatcherLifeCycleEvents.Removed,
                rejected.map(r => MeshAdapter.orderInfoToAPIOrder(r)),
            );
        }
        // Sync the order watching service state locally
        const orders = await getOrdersPromise;
        if (orders.length > 0) {
            await this._onOrderLifeCycleEventAsync(
                OrderWatcherLifeCycleEvents.Added,
                orders.map(o => MeshAdapter.orderInfoToAPIOrder(o)),
            );
        }
    }
    private async _onOrderLifeCycleEventAsync(
        lifecycleEvent: OrderWatcherLifeCycleEvents,
        orders: APIOrderWithMetaData[],
    ): Promise<void> {
        const connection = getDBConnection();
        switch (lifecycleEvent) {
            case OrderWatcherLifeCycleEvents.Updated:
            case OrderWatcherLifeCycleEvents.Added: {
                const signedOrdersModel = orders.map(o => serializeOrder(o));
                await connection.manager.save(signedOrdersModel);
                break;
            }
            case OrderWatcherLifeCycleEvents.Removed: {
                const orderHashes = orders.map(o => o.metaData.orderHash);
                await connection.manager.delete(SignedOrderModel, orderHashes);
                break;
            }
            default:
            // Do Nothing
        }
        this._websocketSRA.orderUpdate(orders);
    }
}
