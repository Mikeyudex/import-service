import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import * as Excel from 'exceljs';
import * as fs from 'fs';
import { Model } from 'mongoose';

import { QueuesEnum, JobsQueuesEnum } from '../../apps/@shared/enums/queues.enum';
import { ExcelPayloadDto } from '../../apps/@shared/dtos/import/import.dto';
import { CreateProductDto } from '../../apps/@shared/dtos/product/create-product.dto';
import { UtilFiles } from '../../apps/@shared/utils/os/fs';
import { TypeProduct, TypeProductDocument } from '../../apps/@shared/schemas/typeProduct.schema';
import { InjectModel } from '@nestjs/mongoose';
import { ProductCategoryDocument, ProductCategory } from '../../apps/@shared/schemas/category.schema';
import { ProductSubCategoryDocument, ProductSubCategory } from '../../apps/@shared/schemas/subcategory.schema';
import { TaxDocument, Tax } from '../../apps/@shared/schemas/taxes.schema';
import { WharehouseDocument, Warehouse } from '../../apps/@shared/schemas/warehouse.schema';
import { UnitOfMeasureDocument, UnitOfMeasure } from '../../apps/@shared/schemas/unit-of-measure.schema';
import { ProviderErp, ProviderErpDocument } from '../../apps/@shared/schemas/provider.schema';
import { Product, ProductDocument } from '../../apps/@shared/schemas/product.schema';
import { Settings, SettingsDocument } from '../../apps/@shared/schemas/settings.schema';
import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { v4 } from 'uuid';

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

    async importProductsFromXlsx(file: any, companyId: string, job: Job) {
        try {
            let filePath = file?.path;
            let fileBuffer = fs.readFileSync(filePath);
            const workbook = new Excel.Workbook();
            await workbook.xlsx.load(fileBuffer);
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

    hasValueObject(values: any[], keyToFind: string): boolean {
        let value = values.find(item => item.hasOwnProperty(keyToFind));
        return value ? true : false;
    };

}