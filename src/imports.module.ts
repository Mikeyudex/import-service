import { Module } from '@nestjs/common';
import { ImportsService } from './imports.service';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';

import { QueuesEnum } from '../../apps/@shared/enums/queues.enum';
import { TypeProductSchema, TypeProduct } from '../../apps/@shared/schemas/typeProduct.schema';
import { ProviderErpSchema, ProviderErp } from '../../apps/@shared/schemas/provider.schema';
import { ProductSchema, Product } from '../../apps/@shared/schemas/product.schema';
import { ProductCategorySchema, ProductCategory } from '../../apps/@shared/schemas/category.schema';
import { ProductSubCategorySchema, ProductSubCategory } from '../../apps/@shared/schemas/subcategory.schema';
import { TaxSchema, Tax } from '../../apps/@shared/schemas/taxes.schema';
import { WarehouseSchema, Warehouse } from '../../apps/@shared/schemas/warehouse.schema';
import { UnitOfMeasureSchema, UnitOfMeasure } from '../../apps/@shared/schemas/unit-of-measure.schema';
import { SettingsSchema, Settings } from '../../apps/@shared/schemas/settings.schema';
import { TypeOfPiece, TypeOfPieceSchema } from '../../apps/@shared/schemas/type-of-piece.schema';
import { Stock, StockSchema } from '../../apps/@shared/schemas/stock.schema';
import { ImportsQueueProcessor } from './queues/imports-queue.processor';

import { ImportsController } from './imports.controller';
import { RedisConfig } from './common/config/redis.config';
import config from './config';
import { BullBoardService } from './common/config/bull-board.config';

@Module({
    imports: [
        MongooseModule.forRootAsync({
            imports: [ConfigModule], // Importa ConfigModule para que ConfigService esté disponible
            useFactory: async (configService: ConfigType<typeof config>) => ({
                uri: configService.database.uri, // Obtiene la URI de las variables de entorno
            }),
            inject: [config.KEY], // Inyecta config.KEY para usarlo en useFactory
        }),
        /*  MongooseModule.forRoot(process.env.MONGODB_URI || "mongodb+srv://miguel92:xBfMZHWH1NplSOfn@grid-erp.7enjr.mongodb.net/grid-erp-db-sandbox?retryWrites=true&w=majority"), */ // conexión con Mongoose
        MongooseModule.forFeature([{ name: TypeProduct.name, schema: TypeProductSchema }]),
        MongooseModule.forFeature([{ name: ProviderErp.name, schema: ProviderErpSchema }]),
        MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
        MongooseModule.forFeature([{ name: ProductCategory.name, schema: ProductCategorySchema }]),
        MongooseModule.forFeature([{ name: ProductSubCategory.name, schema: ProductSubCategorySchema }]),
        MongooseModule.forFeature([{ name: Tax.name, schema: TaxSchema }]),
        MongooseModule.forFeature([{ name: Warehouse.name, schema: WarehouseSchema }]),
        MongooseModule.forFeature([{ name: UnitOfMeasure.name, schema: UnitOfMeasureSchema }]),
        MongooseModule.forFeature([{ name: Settings.name, schema: SettingsSchema }]),
        MongooseModule.forFeature([{ name: TypeOfPiece.name, schema: TypeOfPieceSchema }]),
        MongooseModule.forFeature([{ name: Stock.name, schema: StockSchema }]),
        ClientsModule.register([
            {
                name: 'WEBSOCKET_SERVICE',
                transport: Transport.REDIS,
                options: {
                    host: 'localhost',
                    port: 6379,
                    retryAttempts: 5,
                    retryDelay: 3000,
                },
            },
        ]),
        BullModule.forRootAsync({
            useClass: RedisConfig,
        }),
        BullModule.registerQueue({
            name: QueuesEnum.Imports,
        }),
    ],
    controllers: [ImportsController],
    providers: [ImportsService, ImportsQueueProcessor, BullBoardService],
    exports: [ImportsService],
})
export class ImportsModule { }
