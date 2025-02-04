export function getRedisPort(): number {
    let value = process.env.REDIS_PORT
    if (!value) value = "6379"

    return parseInt(value)
}

export function getRedisURI(): string {
    let value = process.env.REDIS_URI || process.env.REDIS_URL
    if (!value) value = ""

    return value
}

export function getMemcacheURIS(): string {
    let value = process.env.MEMCACHE_URIS
    if (!value) value = ""

    return value
}
