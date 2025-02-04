import { Endpoint, TContext, setSuccessResponse } from "../utility/express"
import { z } from "zod"

// Response Data Body
export const ResponseSchema = z.object({
    message: z.string()
})

/**
 * @dev Handler for the endpoint
*/
const handler = new Endpoint<
    z.AnyZodObject,
    typeof ResponseSchema,
    z.AnyZodObject,
    z.AnyZodObject,
    TContext<unknown>
>(
    "getStatus",
    "return running status of the server",
    "default",
    async (
        req,
        res,
        next
    ) => {
        setSuccessResponse<typeof ResponseSchema>(res, {
            message: "CMGR is running"
        })
        next()
    }
).handler

export default handler