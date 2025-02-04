import { Request, Response, NextFunction } from "express"
import { TContext } from "../utility/express"
import { randomUUID } from "crypto"
import BrowserManager from "../BrowserManager"

export function init(
    browserManager: BrowserManager
) {
    return async (_:Request, res:Response<unknown, TContext<unknown>>, next:NextFunction) => {
        const context: TContext<unknown> = {
            requestId: randomUUID(),
            isSuccess: false,
            startTime: Date.now(),
            resource: null,
            data: null,
            callStack: [
                "init"
            ],
            browserManager: browserManager,
            isRedirect: false
        }
        res.locals = context
        next()
    }
}