/**
 * Class Config: This class manages configuration values 
 *      from the enviornment or configuration files, 
 *      and abstracts all file and mongodb i-o.
 */
import { MongoClient, Db } from 'mongodb';
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from 'path';
import { VersionNumber } from '../models/VersionNumber';

interface ConfigItem {
    name: string;
    value: string;
    from: string;
}

export class Config {
    private configItems: ConfigItem[] = []; 
    private connectionString: string;
    private dbName: string;
    private client?: MongoClient;
    private db?: Db;
    private configFolder: string = "";
    private msmTypesFolder: string;
    private loadTestData: boolean;
    private enumerators: any;

    constructor() {
        this.configFolder = this.getConfigValue("CONFIG_FOLDER", "/opt/mongoSchemaManager/config", false);
        this.msmTypesFolder = this.getConfigValue("MSM_TYPES", "/opt/mongoSchemaManager/msmTypes", false);
        this.connectionString = this.getConfigValue("CONNECTION_STRING", "mongodb://root:example@localhost:27017", true);
        this.dbName = this.getConfigValue("DB_NAME", "test", false);
        this.loadTestData = this.getConfigValue("LOAD_TEST_DATA", "false", false) === "true";

        let enumeratorsFileName = join(this.configFolder, "enumerators", "enumerators.json");
        if (existsSync(enumeratorsFileName)) {
            this.enumerators = JSON.parse(readFileSync(enumeratorsFileName, 'utf-8'));
        } else {
            this.enumerators = {"enumerators":{}};
        }

        console.info("Configuration Initilized:", JSON.stringify(this.configItems)); 
    }

    public async connect(): Promise<void> {
        this.client = new MongoClient(this.connectionString);
        await this.client.connect();
        this.db = this.client.db(this.dbName);
    }

    public getDatabase(): Db {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        return this.db;
    }

    public getCollection(collectionName: string) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        return this.db.collection(collectionName);
    }

    public async dropCollection(collectionName: string) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        const success = await this.db.collection(collectionName).drop();
        if (!success) {
            throw new Error("Drop Collection Failed!");
        }
    }

    public async setVersion(collectionName: string, versionString: string) {
        if (!this.db) {
            throw new Error("config.setVersion - Database not connected");
        }
        const versionDocument = { name: "VERSION", version: versionString };
        const filter = { name: "VERSION" };
        const update = { $set: versionDocument };
        const options = { upsert: true };
    
        await this.getCollection(collectionName).updateOne(filter, update, options);
        console.info("Version set or updated in collection", collectionName, "to", versionString);
        }

    public async getVersion(collectionName: string): Promise<string> {
        if (!this.db) {
            throw new Error("config.getVersion - Database not connected");
        }
        const versionDocument = await this.getCollection(collectionName).findOne({ name: "VERSION" });
        console.info("getVersion from collection", collectionName, "found", JSON.stringify(versionDocument));
        return versionDocument ? versionDocument.version : "0.0.0.0";
    }

    public async applySchemaValidation(collectionName: string, schema: any) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        // TODO
    }

    public async getSchemaValidation(collectionName: string): Promise<any> {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        // TODO
        // let collectionDetails = await db.command({ listCollections: 1, filter: { name: collectionName } });
        // let validationRules = collectionDetails?.collections[0]?.options?.validator || {};
        return {};
    }

    public async clearSchemaValidation(collectionName: string) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        // TODO
    }

    public async addIndexes(collectionName: string, indexes: any[]) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        // TODO
    }

    public async getIndexes(collectionName: string) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        return this.db.collection(collectionName).indexes();
    }

    public async dropIndexes(collectionName: string, names: string[]) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        // TODO
    }

    public async executeAggregations(collectionName: string, aggregations: any) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        const result = await this.db.collection(collectionName).aggregate(aggregations).toArray();
        console.info("Executed: ", aggregations, "Result", result);
    }

    public async bulkLoad(collectionName: string, data: any[]) {
        if (!this.db) {
            throw new Error("Database not connected");
        }
        // TODO
    }

    public async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = undefined;
            this.db = undefined;
        }
    }

    public getEnums(version: number, name: string): any {
        if (this.enumerators[version].version != version) {
            throw new Error("Invalid Enumerators File bad version number sequence")
        }
        if (this.enumerators[version].enumerators.hasOwnProperty(name)) {
            return this.enumerators[version].enumerators[name];
        } else {
            throw new Error("Enumerator does not exist:" + name);
        }
    }

    public getCollectionFiles(): string[] {
        const collectionsFolder = join(this.configFolder, "collections");
        const collectionFiles = readdirSync(collectionsFolder).filter(file => file.endsWith('.json'));
        if (!Array.isArray(collectionFiles)) {
            return [];
        }
        return collectionFiles;
    }

    public getCollectionConfig(fileName: string): any {
        const filePath = join(this.configFolder, "collections", fileName );
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    }

    public getType(type: string): any {
        let typeFilename: string;
        typeFilename = join(this.msmTypesFolder, type + ".json");
        if (!existsSync(typeFilename)) {
            typeFilename = join(this.configFolder, "customTypes", type + ".json") 
            if (!existsSync(typeFilename)) {
                throw new Error("Type Not Found:" + type);
            }
        }
        const typeContent = readFileSync(typeFilename, 'utf-8');
        return JSON.parse(typeContent);
    }

    public getSchema(collection: string, version: VersionNumber): any {
        const schemaFileName = join(this.configFolder, "schemas", collection + "-" + version.getShortVersionString() + ".json");
        return JSON.parse(readFileSync(schemaFileName, 'utf8'));
    }

    public getTestData(filename: string): any {
        let filePath = join(this.configFolder, "testData", filename + ".json");
        return JSON.parse(readFileSync(filePath, 'utf8'));
    }

    public getConfigFolder(): string {
        return this.configFolder;
    }

    public getMsmTypesFolder(): string {
        return this.msmTypesFolder;
    }

    public shouldLoadTestData(): boolean {
        return this.loadTestData;
    }

    private getConfigValue(name: string, defaultValue: string, isSecret: boolean): string {
        let value = process.env[name] || defaultValue;
        let from = 'default';

        if (process.env[name]) {
            from = 'environment';
        } else {
            const filePath = join(this.configFolder, name);
            if (existsSync(filePath)) {
                value = readFileSync(filePath, 'utf-8');
                from = 'file';
            }
        }

        this.configItems.push({ name, value, from });
        return value;
    }
}
