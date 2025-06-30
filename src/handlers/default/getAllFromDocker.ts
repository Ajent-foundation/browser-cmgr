import { Endpoint, TContext, setSuccessResponse, RequestError } from "../../utility/express"
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
 * @dev Handler for the endpoint to get all browsers directly from Docker
*/
const handler = new Endpoint<
    typeof ParamsSchema,
    typeof ResponseSchema,
    typeof BodySchema,
    typeof QuerySchema,
    TContext<typeof ResponseSchema>
>(
    "getAllFromDocker",
    "get all browsers directly from Docker containers",
    "default",
    async (
        req,
        res,
        next
    ) => {
        try {
            const browsers = await res.locals.browserManager.getBrowsersFromDocker()
            
            // Filter browsers to only include essential information
            const filteredBrowsers = browsers.map(browser => ({
                name: browser.name,
                ports: browser.ports,
                leaseTime: browser.leaseTime
            }))
            
            setSuccessResponse<typeof ResponseSchema>(res, {
                capacity: browsers.length,
                used: browsers.filter((b)=> b.leaseTime !== -1).length,
                browsers: filteredBrowsers,
                source: "docker"
            })
        } catch (error) {
            throw new RequestError(
                "INTERNAL_SERVER_ERROR",
                "Failed to retrieve browsers from Docker",
                error instanceof Error ? error.message : String(error)
            )
        }
        next()
    }
).handler

export default handler 