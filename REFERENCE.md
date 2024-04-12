# mongoSchemaManager Reference

## Overview
The msm tool works by connecting to a mongoDB, reading the configurations you provide and then creating the collections, schemas, and indexes described in those configurations. This document describes what those configuration options are and how to use them.

## Schema Folders
At runtime the schema manager will read configuration from the following collection of folders. 
- **collections** - collection configuration files
- **customTypes** - custom type definitions
- **enumerators** - system enumerators
- **schemas** - collection schemas
- **testData** - test data files 

## collections configuration files
Collection configuration files, found in the collections folder, drive all of msm processing. A single configuration file will conform to the [configuration file schema](./docs/config-schema.json), and describe a collection and how it changes over time. Each version of the collection has a Version Number and a schema document. The configuration of a version of the collection may also specify test data to be loaded, indexes to be created or dropped, and migrations that need to be run to update the data.

### Collection Version Numbers
Schema version numbers follow the semantic versioning practice, and add a Enumerators overlay. Schema version numbers consist of 4 numbers seperated by periods (.) with the following meanings:

- Major: Will change with significan breaking changes. These are usually acompanied by migrations and index changes.
- Minor: Will change with minimal loss of functionality, increasing a constraint or removing depricated properties. 
- Patch: Will change with minor, non-breaking changes such as adding new properties, or changing indexes. 
- Enumerators: Will refer to the version of system enumerators used in schema pre-processing. 

### Enumerations
Enumerations are A gold standard with regard to data quality. There are however complications that impede their use, but msm has a way to address those complications and simplify the use of a numerators. The use of enum schema constraints typically face three problems:
- they don't describe the values
- the UI needs to know them
- they can't be reused by different collections

msm uses the ``enumerators/enumerators.json`` file, which provides descriptions in addition to the enumerated values. This data is used during schema pre-processing to support re-use. The msm process will creates a enumerators collection that contains this data so that it can be served to UI consumers. Here is a sample enumerators file with 3 versions.
```json
[
    {
        "name": "Enumerations",
        "status": "Depricated",
        "version": 0,
        "enumerators": {}
    },
    {
        "name": "Enumerations",
        "status": "Active",
        "version": 1,
        "enumerators": {
            "defaultStatus": {
                "Active":"Not Deleted",
                "Archived":"Soft Delete Indicator"
            }
        }
    },
    {
        "name": "Enumerations",
        "status": "Active",
        "version": 2,
        "enumerators": {
            "defaultStatus": {
                "Draft":"Not Complete",
                "Active":"Not Deleted",
                "Archived":"Soft Delete Indicator"
            }, 
            "roles": {
                "user":"Simple User",
                "Admin":"Admin User",
                "Super":"Super User"
            }
        }
    }    
]
```
This information is always loaded into the Enumerators collection, and is used by enum [Schema Pre-Processing directives](#schema-pre-processing).

## Version Processing
When msm is processing a collection, the current version of the collection is examined, and if a newer version is provided then that version is "implemented" by executing the following steps in order:
- Remove schema validation from the collection
- Drop Indexes *if specified*
- Run Migration Pipelines *if provided*
- Create Indexes *if specified*
- Apply Schema
- Load Test Data *if requested*
- Update collection Version document

This is repeated until the newest collection version has been implemented.

## Indexing
Having proper indexing in places a key element of making sure that databases perform properly. The ``addIndexs`` property of the version allows you to add any number of indexes to a collection. Indexes are provided in standard Mongo format, but the name property is required. For example:

```json
"addIndexes": [
    {
        "name": "nameIndex",
        "key": {"userName": 1},
        "options": {"unique": true}
    }
]
```

Having unused indexes creates unnecessary overhead on insert and update operations. The ``dropIndexs`` property can be used to specify a list of index names to be dropped. For example:

```json
"dropIndexes": ["nameIndex"]
```

## Migration Pipelines
Not all scheme of changes can be handled by simply loading a new schema. Unfortunately sometimes a migration is required to change the data in the database to comply with a new schema. Mongo aggregation pipelines specified in the ``aggregations`` attribute are executed to facilitate this functionality. Any Mongo DB aggregation pipeline will run but here are some examples to get you started:

### Add new property with default values
```json
"aggregations": [
    [
        {
            "$addFields": {
                "newProperty": "Default Value"
            },
            "$merge": {
                "into": "sample",
                "on": "_id",
                "whenMatched": "replace",
                "whenNotMatched": "discard"
            }
        }
    ]
]

```

### Drop a depricated property
```json
"aggregations": [
    [
        {
            "$unset": "oldField"  
        },
        {            
            "$merge": {
                "into": "sample",
                "on": "_id",
                "whenMatched": "replace",
                "whenNotMatched": "discard"
            }
        }
    ]
]
```

### Update a property (remove spaces from userName)
```json
"aggregations": [
[
    {
        "$set": {
            "userName": {
                "$replaceAll": {
                    "input": "$userName",
                    "find": " ",
                    "replacement": ""
                }
            }
        }
    },
    {
        "$merge": {
            "into": "collectionName",  // Merge into the same collection
            "on": "_id",  // Match documents based on their `_id`
            "whenMatched": "replace",  // Replace the existing documents
            "whenNotMatched": "discard"  // Discard any non-matching documents (which should not occur in this scenario)
        }
    }
]
]
```

## Schema Pre-Processing
The schema's processed by msm can be any valid mongo DB schema. However the tool provides several schema pre-processing directives that can be used to introduce reusable custom types, or enumerations more easily. These Directives are msm type descriptions that take the place of a bson type attribute in your schema. During pre-processing these msm type properties are replaced with the appropriate bson schema components.

Schema file names are 3-element version specific, that is to say if the collection configuration file has a collection name of ``sample`` and a collection version of ``1.2.3.4`` the tool will look for a schema file with the name ``sample-1.2.3.json`` and use ``"version": 4``of the system enumerations when processing the schema. 

### msmType
The MSM type directive provides a way to implement reusable custom types. The property provided with this directive is the name of the custom type file used. For example, 

Given a schemas/collection.json with
```json
{
    "properties": {
        "name": {
            "description": "A user name",
            "msmType":"customNameType"
        }
    }
}
```

and a customTypes/customNameType.json with
```json
{
    "bsonType": "string", 
    "maxLength": 32
}
```

the resulting schema that is applied will be
```json
{
    "properties": {
        "name": {
            "description": "A user name",
            "bsonType": "string", 
            "maxLength": 32
        }
    }
}
```

In addition to the top custom types that you create MSM introduces a number of new primitives that are easy for you to use, for example

Given a schemas/collection.json with
```json
{
    "properties": {
        "name": {
            "description": "A user name",
            "msmType":"msmWord"
        }
    }
}
```

the resulting schema that is applied will be
```json
{
    "properties": {
        "name": {
            "description": "A user name",
            "bsonType": "string",
	        "pattern": "^[^\\s]{0,32}$"        }
    }
}
```

For a list of the available msmType primitives, see files in [the msmTypes folder](./src/msmTypes/)

### msmEnums
The msmEnums directive is used to provide an enumerated list of valid values from the system in enumerators file for a property. For example:

Given a schemas/collection.json with
```json
{
    "status": {
        "description": "The status",
        "msmEnums": "defaultStatus"
    }
}
```

And a enumerators/enumerators.json with
```json
{
    "enumerators": {
        "defaultStatus": {
            "Active":"Not Deleted",
            "Archived":"Soft Delete Indicator"
        }
    }
}
```

The schema applied will be
```json
{
    "status": {
        "description": "The status",
        "bsonType": "string",
        "enum": [
            "Active",
            "Archived"
        ]
    }
}
```

### msmEnumList
Similar to the ``msmEnums`` directive this directive creates a list of the enumerated values from the system enumerations data, and applies it to an array of strings

Given a schemas/collection.json with
```json
{
    "tags": {
        "description": "A list of tags",
        "msmEnumList": "tags"
    }
}
```

And a enumerators/enumerators.json with
```json
{
    "enumerators": {
        "tags": {
            "Loud": "A loud item",
            "Important": "Something Important"
        }
    }
}
```

The schema applied will be
```json
{
    "status": {
        "description": "A list of tags",
        "bsonType": "array",
        "items": {
            "bsonType": "string",
            "enum": [
                "Loud",
                "Important"
            ]
        }
    }
}
```

## Loading Test Data
If a test data property is provide in a collection version
```json
"testData": "sample-1.0.0.2.json"
```

then the contents of that file will be bulk loaded into the collection when the version is applied. 

Test data is pre-processed by the **TBD** library which handles bson primitives such as:
```json
"_id_": {"$oid":"123456789012345678901234"}
"date": {"$date": "2/27/2024 18:17:58"}
```

## The Collection Version Document
Each collection will have a collection version document, so you must account for these properties in your schema.
```json
{
    "name": "VERSION",
    "version": "1.2.3.4"
}
```