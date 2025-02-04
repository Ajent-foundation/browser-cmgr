import { Request, Response, NextFunction } from "express"
import { isRequestError, isZodError, RequestError, TContext } from "../utility/express"

export async function errHandler(err:unknown, _:Request, res:Response<any, TContext<any>>, next:NextFunction) {
    res.locals.callStack.push("errHandler")
    res.locals.isSuccess = false
    // Handler the different types of errors
    if(isRequestError(err)) {
        res.locals.data = err
    } else if(isZodError(err)) {
        res.locals.data = new RequestError("BAD_REQUEST", "Invalid input. Please check the data you have provided and try again. ", err.errors)
    } else if(err instanceof RequestError) {
        res.locals.data = new RequestError("INTERNAL_SERVER_ERROR", err.message)
    }

    next()
}