import { Request, Response, NextFunction } from "express"
import { TContext } from "../utility/express"

export async function preRequest(req:Request, res:Response<any, TContext<any>>, next:NextFunction) {
    res.locals.callStack.push("preRequest")
    res.log.info(
        {
            requestId: res.locals.requestId,
            body: req.body,
            query: req.query,
            params: req.params,
            headers: req.headers,
            startTime: res.locals.startTime
        }
    )

    next()
}

export async function postRequest(req:Request, res:Response<any, TContext<any>>, next:NextFunction) {
    res.locals.callStack.push("postRequest")
    res.locals.endTime = Date.now()

    res.log.info(
        {
            requestId: res.locals.requestId,
            status: res.statusCode,
            callStack: res.locals.callStack,
            startTime: res.locals.startTime,
            endTime: res.locals.endTime,
            duration: res.locals.endTime - res.locals.startTime,
            response: res.locals.data,
            isSuccess: res.locals.isSuccess
        }
    )

    next()
}