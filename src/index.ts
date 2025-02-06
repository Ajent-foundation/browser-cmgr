import express, { Application, urlencoded, json } from 'express'
import { setDefaults, expressVars } from "./env"
import { init as contextInit, preRequest, postRequest, notFound, errHandler, responder } from "./middlewares"
import { pinoHttp } from "pino-http"
import { createServer, Server } from 'node:http'; 
import pino from 'pino'
import cors from 'cors'
import BrowserManager from "./BrowserManager"

// Routes
import DefaultRoutesHandler from "./routes"

let httpServer: Server | undefined
let browserManager: BrowserManager | undefined

export async function main(deployment: string, logPath?: string, additionalDockerArgs?: Record<string, string>) {
    setDefaults({
        // Core Defaults
        SERVICE_NAME: "browser-cmgr-ts",
        DEPLOYMENT: deployment,
        EXPRESS_PORT: "8200",

        // Browser Defaults
        BROWSER_IMAGE_NAME: "ghcr.io/ajent-foundation/browser-node:latest-brave",
        NUM_BROWSERS: "4",
        HOSTIP: "0.0.0.0",
        BASE_BROWSER_PORT: "10222",
        BASE_BROWSER_APP_PORT: "7070",
        BASE_BROWSER_VNC_PORT: "15900",
        SCREEN_RESOLUTION: "1280x2400",
        CONTAINER_PREFIX: "browser-node-instance",
        DEFAULT_LEASE_TIME: "10 * 60 * 1000",
        CREATE_BROWSER_WAIT_TIME: "500",
        CREATE_BROWSER_MAX_TRIES: "15",
        TEST_BROWSER_WAIT_TIME: "1000",
        TEST_BROWSER_MAX_TRIES: "15",
        KILL_WAIT_TIME: "2 * 1000",
        KILL_MAX_TRIES: "10",
    })

    // III -  Init Logger
    const Logger = pino({
        level: 'info',
    }, pino.multistream([
        { stream: process.stdout },
        ...(logPath ? [
            { stream: pino.destination({
                dest: logPath,
                sync: false,  // Set to true if you need synchronous writes
                mkdir: true   // Create directory if it doesn't exist
            })}
        ] : [])
    ]))

    // V- Init Browser Manager
    browserManager = BrowserManager.getInstance({
        browserImageName: process.env.BROWSER_IMAGE_NAME as string,
        numBrowsers: parseInt(process.env.NUM_BROWSERS as string),
        baseBrowserPort: parseInt(process.env.BASE_BROWSER_PORT as string),
        baseBrowserAppPort: parseInt(process.env.BASE_BROWSER_APP_PORT as string),
        baseBrowserVncPort: parseInt(process.env.BASE_BROWSER_VNC_PORT as string),
        browserPrefix: process.env.CONTAINER_PREFIX as string,
        launchArgs: {},
        maxRetries: parseInt(process.env.KILL_MAX_TRIES as string),
        killWaitTime: parseInt(process.env.KILL_WAIT_TIME as string),
        resolution: {
            width: parseInt((process.env.SCREEN_RESOLUTION|| "1280x2400").split("x")[0]),
            height: parseInt((process.env.SCREEN_RESOLUTION|| "1280x2400").split("x")[1])
        },
        additionalDockerArgs: additionalDockerArgs || {}
    }, Logger)
    await browserManager.init()

    // VI- Init Express
    const EXPRESS_PORT= expressVars.getExpressPort()
    const EXPRESS_APP: Application = express()
    httpServer = createServer(EXPRESS_APP)

    // Core
    EXPRESS_APP.use(contextInit(browserManager))

    // Plugins
    EXPRESS_APP.use(pinoHttp({
        logger: Logger,
        autoLogging: false
    }))
    EXPRESS_APP.use(urlencoded({ extended: true }))
    EXPRESS_APP.use(json())
    EXPRESS_APP.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }))

    // Global Middlewares (PRE)
    EXPRESS_APP.use(preRequest)

    // Express-Routes
    EXPRESS_APP.use(
        "/", 
        DefaultRoutesHandler,
    )
   
    // Global Middlewares (POST)
    EXPRESS_APP.use(notFound)
    EXPRESS_APP.use(errHandler)
    EXPRESS_APP.use(postRequest)
    EXPRESS_APP.use(responder)

    // Start Server
    httpServer.listen(
        EXPRESS_PORT, 
        '0.0.0.0',
        async () => {
            Logger.info(
                {
                    port: EXPRESS_PORT
                },
                `Server is running on ${EXPRESS_PORT}!`,
            );
        }
    )

    return {
        logger: Logger,
    }
}

export async function shutdown() {
    if(browserManager) await browserManager.killAllExisting()
    browserManager = undefined
    if(httpServer) httpServer.close()
    httpServer = undefined
}