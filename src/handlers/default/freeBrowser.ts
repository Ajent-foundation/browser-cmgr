import { Endpoint, RequestError, TContext, setSuccessResponse } from "../../utility/express"
import { z } from "zod"

// Request Params
export const ParamsSchema = z.object({
})

// Response Data Body
export const ResponseSchema = z.object({
})

// Request Body
export const BodySchema = z.object({
    browserID: z.string(),
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
    "freeBrowser",
    "free a browser",
    "default",
    async (
        req,
        res,
        next
    ) => {
        const { browserID } = BodySchema.parse(req.body)
        const browser = await res.locals.browserManager.getBrowserWithId(browserID)
        if(!browser) {
            throw new RequestError("NOT_FOUND", "Browser not found")
        }

        // Make sure it is running
        if (browser.leaseTime !== -1) {
            console.log("killing browser", browser.name)
            // Kill the browser
            await res.locals.browserManager.killBrowser(
                browser.name,
                0
            )
        }

        setSuccessResponse<typeof ResponseSchema>(res, { })
        next()
    }
).handler

export default handler