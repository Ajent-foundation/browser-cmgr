import { Request, Response, NextFunction } from "express"
import { respondJSON, TContext } from "../utility/express"

export async function responder(_:Request, res:Response<any, TContext<any>>, next:NextFunction) {
    res.locals.callStack.push("responder")

    if(res.locals.isRedirect){
        res.redirect(res.locals.data as string)
    } else {
        respondJSON(res)
    }
    next()
}