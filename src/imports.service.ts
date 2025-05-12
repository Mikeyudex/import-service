import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import * as Excel from 'exceljs';
import * as fs from 'fs';
import { Model } from 'mongoose';
import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { v4 } from 'uuid';
import { randomInt } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';

import { QueuesEnum, JobsQueuesEnum } from '../../apps/@shared/enums/queues.enum';
import { ExcelPayloadDto, ExcelPayloadDtoTapete } from '../../apps/@shared/dtos/import/import.dto';
import { CreateStockDto } from '../../apps/@shared/dtos/stock/stock.dto';
import { CreateProductDto } from '../../apps/@shared/dtos/product/create-product.dto';
import { UtilFiles } from '../../apps/@shared/utils/os/fs';
import { TypeProduct, TypeProductDocument } from '../../apps/@shared/schemas/typeProduct.schema';
import { ProductCategoryDocument, ProductCategory } from '../../apps/@shared/schemas/category.schema';
import { ProductSubCategoryDocument, ProductSubCategory } from '../../apps/@shared/schemas/subcategory.schema';
import { TaxDocument, Tax } from '../../apps/@shared/schemas/taxes.schema';
import { WharehouseDocument, Warehouse } from '../../apps/@shared/schemas/warehouse.schema';
import { UnitOfMeasureDocument, UnitOfMeasure } from '../../apps/@shared/schemas/unit-of-measure.schema';
import { ProviderErp, ProviderErpDocument } from '../../apps/@shared/schemas/provider.schema';
import { Product, ProductDocument } from '../../apps/@shared/schemas/product.schema';
import { Settings, SettingsDocument } from '../../apps/@shared/schemas/settings.schema';
import { TypeOfPiece, TypeOfPieceDocument } from '../../apps/@shared/schemas/type-of-piece.schema';
import { Stock, StockDocument } from '../../apps/@shared/schemas/stock.schema';
import { FileUploadHistoryService } from './file-upload-history/file-upload-history.service';
import { FileUploadHistoryDto } from './file-upload-history/dto/file-upload-history.dto';
import { FileUploadOperationTypeEnum, FileUploadStatusEnum } from './file-upload-history/file-upload-history.schema';
import { getCurrentUTCDate } from './common/utils/getUtcDate';

const utilFiles = new UtilFiles();
export class ImportsService {
    logger = new Logger(ImportsService.name);

    constructor(
        @Inject('WEBSOCKET_SERVICE') private readonly websocketService: ClientProxy,
        @InjectQueue(QueuesEnum.Imports) private readonly importQueue: Queue,
        @InjectModel(TypeProduct.name) private readonly typeProductModel: Model<TypeProductDocument>,
        @InjectModel(ProductCategory.name) private readonly productCategoryModel: Model<ProductCategoryDocument>,
        @InjectModel(ProductSubCategory.name) private readonly productSubCategoryModel: Model<ProductSubCategoryDocument>,
        @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
        @InjectModel(Warehouse.name) private readonly warehouseModel: Model<WharehouseDocument>,
        @InjectModel(ProviderErp.name) private readonly providerModel: Model<ProviderErpDocument>,
        @InjectModel(Tax.name) private readonly taxModel: Model<TaxDocument>,
        @InjectModel(UnitOfMeasure.name) private readonly unitOfMeasureModel: Model<UnitOfMeasureDocument>,
        @InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>,
        @InjectModel(TypeOfPiece.name) private readonly typeOfPieceModel: Model<TypeOfPieceDocument>,
        @InjectModel(Stock.name) private readonly stockModel: Model<StockDocument>,
        private readonly fileUploadHistoryService: FileUploadHistoryService
    ) { }

    async importProductsFromXlsxQueue(file: any, companyId: string) {
        try {
            // Añadir el trabajo de importación a la cola
            this.importQueue.add(
                JobsQueuesEnum.ImportProductsFromXlsx,
                { file, companyId },
                { attempts: 3, backoff: { type: 'exponential', delay: 60000 }, });
            return { message: 'Producto en cola de importación.' };
        } catch (error) {
            throw new Error('Error al encolar la importación.');
        }
    }

    async importFromHttp(file: any, companyId: string, userId: string) {
        let errors: { producto: string, codigoexterno: string, error: string }[] = [];
        let success = 0;
        let progress = 0;
        let fileUploadDocId = null;

        try {
            let filePath = file?.path;
            const fileBuffer: any = fs.readFileSync(filePath);
            const workbook = new Excel.Workbook();
            await workbook.xlsx.load(fileBuffer as Excel.Buffer);
            const sheet = workbook.getWorksheet('Productos');
            const header = sheet.getRow(1).values as string[];

            let dataExcel = await this.parsedExcelTapetes(sheet, header);


            let fileUploadDto = new FileUploadHistoryDto();
            fileUploadDto.operationType = FileUploadOperationTypeEnum.PRODUCT_IMPORT;
            fileUploadDto.uploadedBy = userId;
            fileUploadDto.fileName = file.originalname;
            fileUploadDto.status = FileUploadStatusEnum.PROCESSING;
            fileUploadDto.uploadDate = getCurrentUTCDate();

            let fileUploadDoc = await this.fileUploadHistoryService.create(fileUploadDto);
            fileUploadDocId = fileUploadDoc.id;

            for (let i = 0; i < dataExcel.length; i++) {
                try {
                    const product = await this.homologateProductTapete(dataExcel[i], companyId);
                    product.companyId = companyId;
                    product.uuid = v4();

                    if (await this.validateDuplicateProductName(product)) {
                        success++;
                        this.logger.log(`Producto ${product.name} ya existe, se omite.`);
                        continue; // Si el producto ya existe, continuar con el siguiente
                    }

                    let newProduct = await this.productModel.create(product);
                    //Creando el stock para el produto recién creado
                    const createStockDto: CreateStockDto = {
                        productId: newProduct._id.toString(),
                        quantity: product.quantity,
                        warehouseId: product.warehouseId,
                    }
                    await this.stockModel.create(createStockDto);
                    progress = (i / dataExcel.length) * 100;
                    success++;
                } catch (error) {
                    errors.push({ producto: dataExcel[i].linea, codigoexterno: dataExcel[i].cod_externo, error: `Error: ${error.message}` });
                    this.logger.error(error);
                }
            }

            this.fileUploadHistoryService.update(fileUploadDocId, {
                status: FileUploadStatusEnum.COMPLETED,
                recordsFailed: errors.length,
                recordsProcessed: success,
                completionDate: getCurrentUTCDate()
            }).then(result => console.log('Update file upload history completed')).catch(error => console.log(error))

            this.logger.log(`Importación de productos finalizada con exito. Productos creados: ${success}, Errores: ${errors.length}`);
            utilFiles.removeFile(filePath).then(result => console.log(result)).catch(error => console.log(error))

        } catch (error) {
            this.logger.error(`Error al importar productos de archivo`, error);
            this.fileUploadHistoryService.update(fileUploadDocId, {
                status: FileUploadStatusEnum.FAILED,
                recordsFailed: errors.length,
                recordsProcessed: success,
                completionDate: getCurrentUTCDate(),
                errorMessage: error?.message
            }).then(result => console.log('Update file upload history completed')).catch(error => console.log(error))
        }
    }

    async importProductsFromXlsx(file: any, companyId: string, job: Job) {
        try {
            let filePath = file?.path;
            let fileBuffer: any = fs.readFileSync(filePath);
            const workbook = new Excel.Workbook();
            await workbook.xlsx.load(fileBuffer as Excel.Buffer);
            const sheet = workbook.getWorksheet('Productos');
            const header = sheet.getRow(1).values as string[];
            const products = [];
            let progress = 0;
            let dataExcel = await this.parsedExcel(sheet, header);
            let errors: { producto: string, codigoexterno: string, error: string }[] = [];
            let success = 0;

            for (let i = 0; i < dataExcel.length; i++) {
                try {
                    const product = await this.homologateProduct(dataExcel[i], companyId);
                    product.companyId = companyId;
                    product.uuid = v4();
                    products.push(product);
                    await this.productModel.create(product);
                    progress = (i / dataExcel.length) * 100;
                    job.progress(progress);
                    success++;
                } catch (error) {
                    errors.push({ producto: dataExcel[i].nombre, codigoexterno: dataExcel[i].codigoexterno, error: `Error: ${error.message}` });
                    this.logger.error(error);
                }
            }

            this.logger.log(`Importación de productos finalizada con exito. Productos creados: ${success}, Errores: ${errors.length}`);
            utilFiles.removeFile(filePath).then(result => console.log(result)).catch(error => console.log(error))

            //TODO notificar al usuario que la importación se ha completado correctamente
            this.websocketService.send({ cmd: 'ws-event-import' }, { products: products, errors: errors, success: success })
                .subscribe((response: any) => {
                    console.log('Evento enviado:', response);
                });
            return products;
        } catch (error) {
            console.log(error);
            job.log(error);
            return error;
        }
    }

    async parsedExcel(sheet: Excel.Worksheet, header: string[]): Promise<ExcelPayloadDto[]> {
        return new Promise(async (resolve, reject) => {
            try {
                const dataExcel: ExcelPayloadDto[] = [];
                sheet.eachRow((row, rowNum) => {
                    if (rowNum > 1) {
                        const rowData = row.values;
                        const obj: ExcelPayloadDto = new ExcelPayloadDto();
                        // Mapear datos con encabezado
                        header.forEach((key: any, index: number) => {
                            obj[key.trim()] = rowData[index];
                        });
                        obj.codigoexterno = obj.codigoexterno;
                        obj.bodega = obj.bodega;
                        obj.proveedor = obj.proveedor;
                        obj.nombre = obj.nombre;
                        obj.descripcion = obj.descripcion;
                        obj.tipoproducto = obj.tipoproducto;
                        obj.unidadmedida = obj.unidadmedida;
                        obj.precioventa = Number(obj.precioventa);
                        obj.preciocosto = Number(obj.preciocosto);
                        obj.edicionlimitada = obj.edicionlimitada === "SI";
                        obj.imagenes = obj.imagenes;
                        dataExcel.push(obj);
                    }
                });
                resolve(dataExcel);
            } catch (error) {
                reject(error)
            }
        });
    }

    async parsedExcelTapetes(sheet: Excel.Worksheet, header: string[]): Promise<ExcelPayloadDtoTapete[]> {
        return new Promise(async (resolve, reject) => {
            try {
                const dataExcel: ExcelPayloadDtoTapete[] = [];
                sheet.eachRow((row, rowNum) => {
                    if (rowNum > 1) {
                        const rowData = row.values;
                        const obj: ExcelPayloadDtoTapete = new ExcelPayloadDtoTapete();
                        // Mapear datos con encabezado
                        header.forEach((key: any, index: number) => {
                            let _key = key.trim();
                            _key = _key.toLowerCase();
                            obj[_key] = rowData[index];
                        });
                        obj.tipo = obj.tipo;
                        obj.marca = obj.marca;
                        obj.linea = obj.linea;
                        obj.piezas = obj.piezas;
                        obj.tipo_tapete = obj.tipo_tapete;
                        obj.material = obj.material;
                        obj.cantidad = obj.cantidad;
                        obj.precio_mayorista = obj.precio_mayorista;
                        obj.precio_base = obj.precio_base;
                        obj.valor_total = obj.valor_total;
                        obj.observaciones_cliente = obj.observaciones_cliente;
                        dataExcel.push(obj);
                    }
                });
                resolve(dataExcel);
            } catch (error) {
                reject(error)
            }
        });
    }


    async homologateProduct(payloadExcel: ExcelPayloadDto, companyId: string): Promise<CreateProductDto> {
        return new Promise(async (resolve, reject) => {
            try {
                const product: ExcelPayloadDto = payloadExcel;
                let providerShortCode = this.getShortCode(product.proveedor);
                let warehouseShortCode = this.getShortCode(product.bodega);
                let taxShortCode = this.getShortCode(product.proveedor);
                let typeProductShortCode = this.getShortCode(product.tipoproducto);
                let unitOfMeasureShortCode = this.getShortCode(product.unidadmedida);
                let categoryShortCode = this.getShortCode(product.categoria);
                let subCategoryShortCode = this.getShortCode(product.subcategoria);
                let responseIds = await this.getIdFromshortCode(
                    {
                        warehouseShortCode,
                        providerShortCode,
                        taxShortCode,
                        unitOfMeasureShortCode,
                        typeProductShortCode,
                        productCategoryShortCode: categoryShortCode,
                        productSubCategoryShortCode: subCategoryShortCode
                    });
                let lastSku = await this.getLastSkuByCompany(companyId);
                let createProductDto: CreateProductDto = {
                    name: product.nombre,
                    description: product.descripcion,
                    id_type_product: responseIds.typeProductId,
                    providerId: responseIds.providerId,
                    warehouseId: responseIds.warehouseId,
                    externalId: product.codigoexterno,
                    sku: lastSku,
                    unitOfMeasureId: responseIds.unitOfMeasureId,
                    taxId: responseIds.taxId,
                    id_category: responseIds.productCategoryId,
                    id_sub_category: responseIds.productSubCategoryId,
                    quantity: product.preciocosto,
                    costPrice: product.preciocosto,
                    salePrice: product.precioventa,
                    attributes: {
                        color: product.color,
                        size: product.talla,
                        material: product.material,
                        peso: product.peso,
                        isLimitedEdition: product.edicionlimitada,
                    },
                    additionalConfigs: {
                        hasBarcode: product.generacodigodebarra,
                        images: product.imagenes.text.split(","),
                    },

                };
                resolve(createProductDto);
            } catch (error) {
                reject(error);
            }
        });
    }

    async homologateProductTapete(payloadExcel: ExcelPayloadDtoTapete, companyId: string): Promise<CreateProductDto> {
        return new Promise(async (resolve, reject) => {
            try {
                const product: ExcelPayloadDtoTapete = payloadExcel;

                let typeProducts = await this.typeProductModel.find().exec();
                let lastSku = await this.getLastSkuByCompany(companyId);
                let categories = await this.productCategoryModel.find().exec();
                let idCategory = await this.getCategoryId(product.marca, categories);
                let typeOfPieces = await this.typeOfPieceModel.find().exec();
                let typeOfPiecesPayloadExcel = [product.pieza_1, product.pieza_2, product.pieza_3, product.pieza_4, product.pieza_5];
                let typeOfPiecesIds = this.getTypeOfPiecesIds(typeOfPiecesPayloadExcel, typeOfPieces);

                let createProductDto: CreateProductDto = {
                    name: product.linea,
                    description: product.descripcion,
                    id_type_product: this.getTypeProductId(product.tipo, typeProducts),
                    providerId: "4d011943-8be5-4316-bef8-73e300c876a3",
                    warehouseId: "67ac30a3-861c-4cc4-ac39-a23233440c1d",
                    externalId: product.cod_externo,
                    sku: lastSku,
                    unitOfMeasureId: "66c7ce424e4c3032d6ccc2c9",
                    taxId: "66cd4e5b66edf5584b16d940",
                    id_category: idCategory,
                    id_sub_category: "680aaf320d033722d44d4bff",
                    quantity: isNaN(Number(product?.cantidad)) ? 1 : Number(product?.cantidad),
                    costPrice: isNaN(Number(product?.precio_mayorista)) ? 0 : Number(product?.precio_mayorista),
                    salePrice: isNaN(Number(product?.precio_base)) ? 0 : Number(product?.precio_base),
                    typeOfPieces: typeOfPiecesIds,
                };
                resolve(createProductDto);
            } catch (error) {
                reject(error);
            }
        });
    }

    getShortCode(value: string): string {
        return value?.split("-")[0];
    }

    async getIdFromshortCode(
        payload:
            {
                warehouseShortCode: string,
                providerShortCode: string,
                taxShortCode: string,
                unitOfMeasureShortCode: string,
                typeProductShortCode: string,
                productCategoryShortCode: string,
                productSubCategoryShortCode: string
            }): Promise<{
                warehouseId: string,
                providerId: string,
                taxId: string,
                unitOfMeasureId: string,
                typeProductId: string,
                productCategoryId: string,
                productSubCategoryId: string
            }> {
        return new Promise(async (resolve, reject) => {
            try {
                let warehouseId = (await this.warehouseModel.findOne({ shortCode: payload.warehouseShortCode }).lean()).uuid;
                let providerId = (await this.providerModel.findOne({ shortCode: payload.providerShortCode }).lean()).uuid;
                let taxId = (await this.taxModel.findOne({ shortCode: payload.taxShortCode }).lean())._id.toString();
                let unitOfMeasureId = (await this.unitOfMeasureModel.findOne({ shortCode: payload.unitOfMeasureShortCode }).lean())._id.toString();
                let TypeProductDocument = await this.typeProductModel.findOne({ shortCode: payload.typeProductShortCode }).lean();
                let ProductCategoryDocument = await this.productCategoryModel.findOne({ shortCode: payload.productCategoryShortCode }).lean();
                let productSubCategoryDocument = await this.productSubCategoryModel.findOne({ shortCode: payload.productSubCategoryShortCode }).lean();
                let response = {
                    warehouseId,
                    providerId,
                    taxId,
                    unitOfMeasureId,
                    typeProductId: TypeProductDocument._id.toString(),
                    productCategoryId: ProductCategoryDocument.uuid,
                    productSubCategoryId: productSubCategoryDocument.uuid
                };
                resolve(response)
            } catch (error) {
                reject(error?.message);
            }
        });
    }

    async getLastSkuByCompany(companyId: string): Promise<string | null> {
        const lastProduct = await this.productModel
            .findOne({ companyId })  // Filtrar por companyId
            .sort({ sku: -1 })        // Ordenar por SKU en orden descendente
            .select('sku')            // Seleccionar solo el campo sku
            .exec();

        //Si no existen productos para la empresa, se debe buscar en la configuración de la empresa el initialSku y devolverlo.
        if (!lastProduct) {
            let setting = await this.settingsModel.findOne({ name: 'products', companyId: companyId }).lean();

            if (Array.isArray(setting.value) && this.hasValueObject(setting.value, 'initialSku')) {
                let initialSku = setting.value.filter(val => val.initialSku)[0]['initialSku'];
                return initialSku as string;
            } else {
                return "1000";
            }
        }
        return lastProduct ? String(Number(lastProduct.sku) + 1) : null;
    }

    getTypeProductId(typeProductExcel: string, typeProducts: TypeProductDocument[]): string {
        switch (typeProductExcel) {
            case 'LIVIANOS':
                return typeProducts.find(typeProduct => typeProduct.name === 'Livianos')._id.toString();
            case 'PESADOS':
                return typeProducts.find(typeProduct => typeProduct.name === 'Pesados')._id.toString();
            default:
                return typeProducts.find(typeProduct => typeProduct.name === 'Livianos')._id.toString();
        }
    }

    async getCategoryId(categoryExcel: string, categories: ProductCategoryDocument[]): Promise<string> {
        try {
            let category = categories.find(category => category.name.toLowerCase() === categoryExcel.toLowerCase());
            if (category) {
                return category._id.toString();
            } else {
                let newCategory = {
                    name: categoryExcel,
                    description: categoryExcel,
                    shortCode: randomInt(1000, 9999).toString(),
                    uuid: v4()
                };
                let category = new this.productCategoryModel(newCategory);
                let savedCategory = await category.save();
                if (savedCategory) {
                    return savedCategory._id.toString();
                } else {
                    return '';
                }
            }
        } catch (error) {
            return '';
        }
    }

    hasValueObject(values: any[], keyToFind: string): boolean {
        let value = values.find(item => item.hasOwnProperty(keyToFind));
        return value ? true : false;
    };

    getTypeOfPiecesIds(piecesPayloadExcel: string[], typeOfPieces: TypeOfPieceDocument[]): string[] {
        let typeOfPiecesIds = [];
        for (let index = 0; index < piecesPayloadExcel.length; index++) {
            const piece = piecesPayloadExcel[index];
            if (piece) {
                let typeOfPiece = typeOfPieces.find(typeOfPiece => {
                    return typeOfPiece.name.toLowerCase() === piece.toLowerCase()
                });
                if (typeOfPiece) {
                    typeOfPiecesIds.push(typeOfPiece._id.toString());
                }
            }
        }
        return typeOfPiecesIds;
    }

    async validateDuplicateProductName(product: CreateProductDto): Promise<boolean> {
        const existingProduct = await this.productModel.findOne({ name: product.name }).exec();
        return existingProduct ? true : false;
    }

}