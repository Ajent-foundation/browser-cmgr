import { Endpoint, RequestError, TContext, setSuccessResponse } from "../../utility/express"
import puppeteer from "puppeteer-core"
import { Browser } from "../../BrowserManager"
import axios, { isAxiosError } from "axios"
import { z } from "zod"

// Request Params
export const ParamsSchema = z.object({
})

// Response Data Body
export const ResponseSchema = z.object({
})

// Request Body
export const BodySchema = z.object({
    sessionID: z.string(),
    leaseTime: z.number().min(1).max(60),

    // Optional
    browserID: z.string().optional(),
    clientID: z.string().optional(),
    callbackURL: z.string().optional(),
    fingerprintID: z.string().optional(),
    proxyServer: z.string().optional(),
    proxyAuth: z.string().optional(),
    isDebug: z.boolean().optional(),
    //Deprecated
    viewport: z.object({
        width: z.number(),
        height: z.number()
    }).optional(),
    driver: z.string().optional(),
    reportKey: z.string().optional(),
    sessionUUID: z.string().optional(),
    isExtending: z.boolean().optional(),
    vncMode: z.enum(["ro", "rw"]).optional(),
    isPasswordProtected: z.boolean().optional(),
    numberOfCameras: z.number().min(1).max(4).optional(),
 	numberOfMicrophones: z.number().min(1).max(4).optional(),
 	numberOfSpeakers: z.number().min(1).max(4).optional(),
 	locale: z.string().optional(),
 	language: z.string().optional(),
 	timezone: z.string().optional(),
 	platform: z.enum(["win32", "linux", "darwin"]).optional(),
 	extensions: z.array(z.string()).optional(),
 	overrideUserAgent: z.string().optional(),
    screen: z.object({
        resolution: z.enum(["1280x1024", "1920x1080", "1366x768", "1536x864", "1280x720", "1440x900", "1280x2400"]),
        depth: z.string(),
        dpi: z.string()
    }).optional(),
})

// Request Query
export const QuerySchema = z.object({
})

/**
 * @dev Handler for the endpoint
*/
const handler = new Endpoint<
    typeof ParamsSchema,
    typeof ResponseSchema,
    typeof BodySchema,
    typeof QuerySchema,
    TContext<typeof ResponseSchema>
>(
    "getBrowser",
    "get a browser",
    "default",
    async (
        req,
        res,
        next
    ) => {
        let {
            browserID, leaseTime, proxyServer, proxyAuth, sessionID, clientID, 
            fingerprintID, callbackURL, driver, reportKey, sessionUUID, vncMode, isPasswordProtected,
            numberOfCameras, numberOfMicrophones, numberOfSpeakers, locale, language, timezone, platform, extensions, overrideUserAgent, screen
        } = BodySchema.parse(req.body)

        if(!vncMode || (vncMode !== "ro" && vncMode !== "rw")) {
            vncMode = "ro"
        }

        if(!isPasswordProtected) {
            isPasswordProtected = false
        }

        // Find the browser
        let browser: Browser | undefined = undefined
        
        if(browserID){
            browser = await res.locals.browserManager.getBrowserWithId(browserID)
        } else if(sessionID){
            browser = await res.locals.browserManager.getBrowserWithSessionId(sessionID)
        }

        // Check if the browser id exists
        if(!browser) {
            if(req.body.isExtending){
                throw new RequestError("NOT_FOUND", "Browser not found")
            }

            // Create new browser
            browser = await res.locals.browserManager.reserveBrowser(leaseTime)
            if(!browser) {
                throw new RequestError("BAD_REQUEST", "Browser out of capacity")
            }

            await res.locals.browserManager.setInternals(browser.name, {
                sessionID: sessionID,
                clientID: clientID || "",
                webhook: callbackURL || "",
                fingerprintID: fingerprintID || "",
                driver: driver || "",
                reportKey: reportKey || "",
                sessionUUID: sessionUUID || ""
            })

            let created = false
            let proxy = ["", ""]
            let vncPassword = ""
            for (let i = 0; i < parseInt(process.env.CREATE_BROWSER_MAX_TRIES || "15"); i++) {
                try {
                    if(proxyServer && proxyAuth){
                        proxy = proxyAuth.split(":")
                    
                        // Misconfigured proxy
                        if(proxy.length < 2) {
                            proxyServer = undefined
                        }
                    }

                    // Launch browser
                    const requestBody : Record<string, any> = {
                        leaseTime: leaseTime,
                        screen: {
                            resolution: screen?.resolution || process.env.SCREEN_RESOLUTION || "1280x2400",
                            depth: screen?.depth || process.env.SCREEN_DEPTH || "24",
                            dpi: screen?.dpi || process.env.SCREEN_DPI || "96"
                        },
                        vnc: {
                            mode : vncMode,
                            isPasswordProtected : isPasswordProtected
                        },
                        numberOfCameras,
                        numberOfMicrophones,
                        numberOfSpeakers,
                        locale,
                        language,
                        timezone,
                        platform,
                        extensions,
                        overrideUserAgent
                    }
                    if(req.body.proxyServer){
                        requestBody["proxy"] = {
                            url      : req.body.proxyServer,
                            username : proxy[0],
                            password : proxy[1]
                        }
                    }

                    // Log the browser
                    const launchResponse = await axios.post(
                        `http://localhost:${browser.ports.app}/action/launch`,
                        requestBody,
                        {
                            headers:{
                                "Content-Type": "application/json"
                            }
                        }
                    )
    
                    if(launchResponse.data) {
                        vncPassword = launchResponse.data.password
                    }

                    created = true
                    break
                } catch (err) {
                    res.log.error(
                        { 
                            browserName: browser.name,
                            error: err instanceof Error ? err.message : "Unknown Error",
                            stack: err instanceof Error ? err.stack : "Unknown Stack",
                            data: isAxiosError(err) && err.response ? err.response.data : {},
                        },
                        "ERROR_LAUNCHING_BROWSER",
                    )
                }
    
                // sleep
                await new Promise(resolve => setTimeout(resolve, parseInt(process.env.CREATE_BROWSER_WAIT_TIME || "500")))
            }
                    
            // make sure the command didn't fail, even after all these trials
            if (!created) {
                res.log.error(
                    { browserName: browser.name },
                    "COULD_NOT_CREATE_BROWSER"
                )
            
                // try to kill the browser, even though it's not created from this
                // call, since the reason might be that it's already running for
                // any other unknown reason.
                await res.locals.browserManager.killBrowser(browser.name)
                throw new RequestError("UNKNOWN_ERROR", "Couldn't create the browser container")
            }

            // Now the container has been spawned
            // Try connecting to the browser every second for 15 seconds
            let connected = false
            for (let i = 0; i < parseInt(process.env.TEST_BROWSER_MAX_TRIES || "15"); i++) {
                try {
                    // TODO - driver should determine method of connection
                    const connection = await puppeteer.connect({ 
                        browserURL: `http://${process.env.HOSTIP}:${browser.ports.browser}` 
                    })
                    connection.disconnect()
                    connected = true

                    res.log.info(
                        { browserName: browser.name },
                        "CONNECTED_TO_BROWSER"
                    )
                    break
                } catch (err) {
                    res.log.error(
                        { browserName: browser.name },
                        "COULD_NOT_CONNECT_TO_BROWSER"
                    )
                }

                await new Promise(resolve => setTimeout(resolve, parseInt(process.env.TEST_BROWSER_WAIT_TIME || "1000")))
            }

             // make sure the connection got established and didn't fail, even after all these trials
            if (!connected) {
                // kill the browser that was created here, to allow using it again
                await res.locals.browserManager.killBrowser(browser.name)
                throw new RequestError("UNKNOWN_ERROR", "Couldn't test the connection of the browser")
            }

            await res.locals.browserManager.setVncPassword(browser.name, vncPassword)
            if(req.body.isDebug){
                await res.locals.browserManager.setDebug(browser.name, req.body.isDebug)
            }

            if(req.body.screen){
                await res.locals.browserManager.setViewport(browser.name, {
                    width: parseInt(req.body.screen.resolution.split("x")[0]),
                    height: parseInt(req.body.screen.resolution.split("x")[1])
                })
            } else {
                await res.locals.browserManager.setDefaultViewport(browser.name)
            }

            setSuccessResponse<typeof ResponseSchema>(res, {
                url: `http://${process.env.HOSTIP}:${browser.ports.browser}`,
                id: browser.labels?.id,
                vncPassword: vncPassword,
                appPort: browser.ports.app,
                wsPort: browser.ports.browser,
                vncPort: browser.ports.vnc,
                browserPort: browser.ports.browser
            })
            next()
        } else {
            try {
                // Extend lease time
                await axios.post(`http://localhost:${browser.ports.app}/action/lease`, {
                    leaseTime: leaseTime
                })
            } catch (err) {
                res.log.error(
                    { 
                        browserName: browser.name,
                        error: err instanceof Error ? err.message : "Unknown Error",
                        stack: err instanceof Error ? err.stack : "Unknown Stack",
                        data: isAxiosError(err) && err.response ? err.response.data : {},
                    },
                    "ERROR_EXTENDING_LEASE_TIME",
                )

                throw new RequestError("UNKNOWN_ERROR", "Couldn't extend the lease time of the browser")
            }

            // Reset timeout
            await res.locals.browserManager.resetTimeout(browser.name)
            await res.locals.browserManager.setTimeout(browser.name, leaseTime)
            setSuccessResponse<typeof ResponseSchema>(res, {
                url: `http://${process.env.HOSTIP}:${browser.ports.browser}`,
                id: browser.labels?.id,
                appPort: browser.ports.app,
                vncPort: browser.ports.vnc,
                wsPort: browser.ports.browser,
                browserPort: browser.ports.browser
            })
            next()
        }
    }
).handler

export default handler