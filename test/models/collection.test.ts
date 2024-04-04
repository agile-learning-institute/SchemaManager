import { Config } from '../../src/config/Config';
import { Collection } from '../../src/models/Collection';

// Setup for mocking MongoDB findOne
const findOneMock = jest.fn();

// Mock the Version class
jest.mock("../../src/models/version", () => {
    return {
        Version: jest.fn().mockImplementation(() => {
            return {
                getVersion: jest.fn().mockReturnValue("1.0.0"),
                apply: jest.fn()
            };
        })
    };
});

// Mock the Config
jest.mock("../../src/config/config", () => {
    return {
        Config: jest.fn().mockImplementation(() => {
            return {
                getVersion: jest.fn().mockReturnValue("0.0.0"),
            };
        })
    };
});

describe('Collection', () => {

    test('test constructor', () => {
        process.env.CONFIG_FOLDER = "./test/resources";
        const config = new Config();
        const collectionConfig = {
            "collectionName": "foo",
            "versions": [{ "version": "1.0.0" }]
        };
        const theCollection = new Collection(config, collectionConfig);

        expect(theCollection.getName()).toBe("foo");
        expect(theCollection.getVersions().length).toBe(1);
        expect(theCollection.getVersions()[0].getVersion()).toBe("1.0.0");
    });

    test('test process', async () => {
        const config = new Config();
        const collectionConfig = {
            collectionName: "testCollection",
            versions: [{ version: "1.0.0" }]
        };

        const collection = new Collection(config, collectionConfig);
        expect(collection.getCurrentVersion()).toBe("");
        await collection.processVersions();
        expect(collection.getCurrentVersion()).toBe("0.0.0");
        expect(config.getVersion).toHaveBeenCalledTimes(2);    
    });

});