export function getMongoURI(): string {
    let value = process.env.MONGO_URI
    if (!value) value = ""

    return value
}

export function getMongoDBName(): string {
    let value = process.env.MONGO_DB_NAME
    if (!value) value = ""

    return value
}