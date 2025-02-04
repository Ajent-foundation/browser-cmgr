export function getExpressPort(): number {
    let value = process.env.EXPRESS_PORT
    if (!value) value = "8200"

    return parseInt(value)
}