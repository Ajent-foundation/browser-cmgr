import * as dotenv from "dotenv"
import * as expressEnvVars from "./groups/express"
import * as mongoEnvVars from "./groups/mongo"
import * as cacheEnvVars from "./groups/caach"
import * as redisEnvVars from './groups/redis'

export function loadEnv(mode:"dev"|"staging"|"prod"="prod", overridePath?: string){
    // By default load .env file (PROD)
    let envFilePath = "./.env" 
    if (mode === "dev") {
        envFilePath = "./.env.dev"
    } else if (mode === "staging") {
        envFilePath = "./.env.staging"  
    }
    
    if(overridePath) envFilePath = overridePath
    dotenv.config({path: envFilePath})
}

export function setDefaults(
    args: {[string: string]: string|undefined}, 
    overrideExisting: boolean = false
){
    for (const key in args) {
        if(args[key] === undefined) continue
        if (!process.env[key] || overrideExisting) {
            process.env[key] = args[key]
        }
    }
}

export const expressVars = expressEnvVars
export const mongoVars = mongoEnvVars
export const cacheVars = cacheEnvVars
export const redisVars = redisEnvVars