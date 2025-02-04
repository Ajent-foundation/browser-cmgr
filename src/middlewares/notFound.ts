import { Request, Response, NextFunction } from "express"
import { RequestError, TContext } from "../utility/express"

export async function notFound(_:Request, res:Response<any, TContext<RequestError>>, next:NextFunction) {
    res.locals.callStack.push("notFound")

    if(!res.locals.resource) {
        res.locals.isSuccess = false
        res.locals.data = new RequestError("NOT_FOUND")
    }

    next()
}