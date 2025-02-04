export function getRedisHost(): string {
    let value = process.env.REDIS_HOST
    if (!value) value = ""

    return value
}

export function getRedisPort(): number {
    let value = parseInt(process.env.REDIS_PORT || "6379")
    if (!value) value = 6379

    return value
}

export function getRedisUsername(): string|undefined {
    let value = process.env.REDIS_USERNAME
    if (!value) return undefined

    return value
}

export function getRedisPassword(): string|undefined {
    let value = process.env.REDIS_PASSWORD || process.env.REDIS_PASS
    if (!value) return undefined

    return value
}

export function getRedisEmptyTls(): string|undefined {
    let value = process.env.REDIS_EMPTY_TLS
    if (!value) return undefined

    return value
}

export function getRedisClusterMode(): string|undefined {
    let value = process.env.REDIS_CLUSTER_MODE
    if (!value) return undefined

    return value
}

export function getRedisMasterName(): string {
    let value = process.env.REDIS_MASTER_NAME
    if (!value) value = ""

    return value
}