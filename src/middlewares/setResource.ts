import { Request, Response, NextFunction } from "express"
import { TContext } from "../utility/express"

// Used to determine 404
export default function setResource(resource: string) {
    return async function setResource(_:Request, res:Response<any, TContext<any>>, next:NextFunction) {
        res.locals.callStack.push("setResource")
        res.locals.resource = resource
    
        next()
    }
}
