import {  z, ZodError, ZodType } from "zod"
import { NextFunction, Request, Response } from "express"
import BrowserManager from "../../BrowserManager"

export type TErrorType = "UNKNOWN_ERROR" | "NOT_FOUND" | "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "CONFLICT" | "INTERNAL_SERVER_ERROR"

export class RequestError extends Error { 
    private _type : TErrorType
    private _details: unknown

    constructor(
        type: TErrorType,
        message?: string,
        details: unknown = {}
    ) {
        super(message)
        this.name = 'RequestError'
        this._type = type
        this._details = details
    }

    /**
     * @dev type is a function that returns the type of the error 
     */
    get type() {
        return this._type
    }

    /**
     * @dev type is a function that returns the type of the error 
    */
   private _getDefaultErrorMessage() : string {
        switch(this._type) {
            case "UNKNOWN_ERROR":
                return "An unknown error has occurred"
            case "NOT_FOUND":
                return "The requested resource was not found"
            case "BAD_REQUEST":
                return "The request was malformed"
            case "UNAUTHORIZED":
                return "The request was unauthorized"
            case "FORBIDDEN":
                return "The request was forbidden"
            case "CONFLICT":
                return "The request caused a conflict"
            case "INTERNAL_SERVER_ERROR":
                return "An internal server error has occurred"
            default:
                return "An unknown error has occurred"
        }
   }

    /*
    * @dev statusCode is a function that returns the status code of the error
    */
   get statusCode() {
         switch(this._type) {
              case "NOT_FOUND":
                return 404
              case "BAD_REQUEST":
                return 400
              case "UNAUTHORIZED":
                return 401
              case "FORBIDDEN":
                return 403
              case "CONFLICT":
                return 409
              case "INTERNAL_SERVER_ERROR":
                return 500
              default:
                return 500
         }
    }

    /*
    * @dev formatUserError is a function that returns the error in a user-friendly format
    */
    public formatUserError(): Record<string, unknown> {
        const response: Record<string, unknown> = {
            message: this.message !== "" ? this.message : this._getDefaultErrorMessage(),
            code: this._type
        }

        if(this._details && Object.keys(this._details).length > 0) {
            response.details = this._details
        }

        return {
            success:false,
            error: response
        }
    }
}

/** 
 * @dev isRequestError is a function that checks if an error is a RequestError
*/
export function isRequestError(error: unknown): error is RequestError {
    return error instanceof RequestError
}

/** 
 * @dev respondJSON is a function that responds to the client with a JSON response
*/
export async function respondJSON(
    res:Response
): Promise<void> {
    res.setHeader('Content-Type', 'application/json')
    if (res.locals.isSuccess) {
        res
            .status(res.locals.isNewResource ? 201 : 200)
            .json(res.locals.data ? res.locals.data : null)
    } else {
        const data = res.locals.data
        let error = new RequestError("UNKNOWN_ERROR")
        if(data && isRequestError(data) && error.type !== "INTERNAL_SERVER_ERROR") {
            // Overwrite default error
            error = data
        } 
        
        // Respond to client
        res
            .status(error.statusCode)
            .json(error.formatUserError())
    }
}

export function setSuccessResponse<O extends ZodType>(res:Response<any, TContext<unknown>>, data ?:z.infer<O> ){
    res.locals.isSuccess = true
    res.locals.data = data ? {
        success: true,
        ...data
    } : null
}


export function setRedirectResponse(res:Response<any, TContext<unknown>>, uri:string){
    res.locals.isSuccess = true
    res.locals.isRedirect = true
    res.locals.data = uri
}

/**
 * @dev TBase is a type that represents the base of a zObject
 */
export type TBaseLocals = {}

/**
 * @dev TContext is a type that represents the response of a handler
 * @param O a zObject of the Response
 */
export type TContext<O> = {
    requestId: string,
    startTime: number,
    resource: string | null,
    endTime?: number,
    callStack: string[],
    isSuccess: boolean,
    isNewResource?: boolean,
    data: O | null,
    isRedirect: boolean,
    browserManager: BrowserManager
}

/**
 * @dev LWithBase is a type that represents the Locals with the base Locals
 */
type LWithBase<L extends Record<string, any>> = L & TBaseLocals;

/**
 * @dev TEndpointHandler is a type that represents the handler function of an endpoint
 * @param P a zObject of the Request Params
 * @param R a zObject of the Response
 * @param B a zObject of the Request Body
 * @param Q a zObject of the Request Query
 * @param L a Record of the Locals
 */
export type TEndpointHandler<
    P extends z.ZodType,
    R extends z.ZodType,
    B extends z.ZodType,
    Q extends z.ZodType,
    L extends Record<string, any>,
> = (
    req: Request<
        z.infer<P>, 
        TContext<z.infer<R>>, 
        z.infer<B>, 
        z.infer<Q>, 
        L
    >, 
    res: Response<TContext<z.infer<R>>, LWithBase<L>>, 
    next: NextFunction
    
) => Promise<void>

/** 
 * @dev Endpoint is a class that represents an endpoint
 * @param P a zObject of the Request Params
 * @param R a zObject of the Response
 * @param B a zObject of the Request Body
 * @param Q a zObject of the Request Query
 * @param L a Record of the Locals
*/
export class Endpoint<
    P extends z.ZodType,
    R extends z.ZodType,
    B extends z.ZodType,
    Q extends z.ZodType,
    L extends Record<string, any>, 
> {
    private _handler: TEndpointHandler<P,R,B,Q,L>
    public name: string
    public description: string
    public group: string

    /** 
     * @dev Constructor of the Endpoint
     * @param name a string of the name of the endpoint
     * @param description a string of the description of the endpoint
     * @param group a string of the group of the endpoint
     * @param handler a TEndpointHandler of the handler of the endpoint
    */
    constructor(
        name: string,
        description: string,
        group: string,
        handler: TEndpointHandler<P,R,B,Q,L>
    ){
        this.name = name
        this.description = description
        this.group = group
        this._handler = handler
    }

    /** 
     * @dev handler is a function that returns the handler of the endpoint
     */
    get handler(){
        const handler = this._handler
        return async function call(
            req: Request<
                z.infer<P>, 
                TContext<z.infer<R>>, 
                z.infer<B>, 
                z.infer<Q>, 
                L
            >, 
            res: Response<TContext<z.infer<R>>, LWithBase<L>>, 
            next: NextFunction
        ) {
            try {
                return await handler(req, res, next)
            } catch (error:unknown) {
                next(error)
            }
        }
    }
}

export function isZodError(err: unknown): err is ZodError {
    return Boolean(
      err && (err instanceof ZodError || (err as ZodError).name === 'ZodError'),
    );
  }