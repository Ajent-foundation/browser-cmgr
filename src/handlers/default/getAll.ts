import { Endpoint, TContext, setSuccessResponse } from "../../utility/express"
import { z } from "zod"

// Request Params
export const ParamsSchema = z.object({
})

// Response Data Body
export const ResponseSchema = z.object({
})

// Request Body
export const BodySchema = z.object({
})

// Request Query
export const QuerySchema = z.object({
})

/**
 * @dev Handler for the endpoint
*/
const handler = new Endpoint<
    typeof ParamsSchema,
    typeof ResponseSchema,
    typeof BodySchema,
    typeof QuerySchema,
    TContext<typeof ResponseSchema>
>(
    "getAll",
    "get all browsers",
    "default",
    async (
        req,
        res,
        next
    ) => {
        const browsers = await res.locals.browserManager.getBrowsers()
        setSuccessResponse<typeof ResponseSchema>(res, {
            capacity: process.env.NUM_BROWSERS || 0,
            used: browsers.filter((b)=> b.leaseTime !== -1).length,
            browsers: browsers
        })
        next()
    }
).handler

export default handler