import { Docker } from 'docker-cli-js'
import { io, Socket } from 'socket.io-client'
import { Logger } from "pino"
import axios from 'axios'
import path from 'path'

/**
 * Represents a browser instance with its configuration and state
 */
export type Browser = {
    name: string
    index: number
    isUp: boolean
    isRemoving: boolean
    lastUsed: number
    createdAt: number
    leaseTime: number
    ports: {
        vnc: number
        app: number
        browser: number
    },
    vncPassword?: string;
    isDebug?: boolean;
	viewport: {
        width: number
        height: number
    };
    labels?: Record<string, string>
    webhook?: string
    sessionID?: string
    fingerprintID?: string
    clientID?: string
    driver?: string
    reportKey?: string
    sessionUUID?: string
}

/**
 * Configuration options for the BrowserManager
 */
type Config = {
    browserImageName: string
    browserPrefix: string
    numBrowsers: number
    baseBrowserPort: number
    baseBrowserAppPort: number
    baseBrowserVncPort: number
    screenResolution?: string
    launchArgs?: Record<string, string>
    maxRetries: number
    killWaitTime: number
    resolution: {
        width: number
        height: number
    }
    additionalDockerArgs: Record<string, string>
}

/**
 * Default Docker binary paths for different operating systems
 */
const DEFAULT_DOCKER_PATHS = {
    win32: [
        'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
        'C:\\Program Files (x86)\\Docker\\Docker\\resources\\bin\\docker.exe',
        '%ProgramFiles%\\Docker\\Docker\\resources\\bin\\docker.exe',
        '%ProgramW6432%\\Docker\\Docker\\resources\\bin\\docker.exe'
    ],
    darwin: [
        '/usr/local/bin/docker',
        '/opt/homebrew/bin/docker',
        '/usr/bin/docker',
        '/Applications/Docker.app/Contents/Resources/bin/docker',
        '~/Library/Group Containers/group.com.docker/docker'
    ],
    linux: [
        '/usr/bin/docker',
        '/usr/local/bin/docker',
        '/opt/bin/docker',
        '/snap/bin/docker',
        '/var/lib/snapd/snap/bin/docker',
        '~/.docker/cli-plugins/docker'
    ]
} as const;

/**
 * Manages a pool of browser containers using Docker
 * Handles container lifecycle, health checks, and browser state management
 */
export default class BrowserManager {
    private static _instance: BrowserManager;
    private _browsers: Record<string, Browser> = {};
    private _docker: Docker
    private _config: Config
    private _logger: Logger
    private _sockets: Record<string, Socket> = {}
    private _timeoutObjs: Record<string, NodeJS.Timeout> = {}
    private _isKilling: boolean = false

    private constructor(config: Config, logger: Logger) {
        this._config = config
        this._logger = logger

        const dockerEnv = this.buildDockerEnvironment()
        this._docker = new Docker({
            echo: true,
            env: dockerEnv
        })
    }

    /**
     * Builds the Docker environment configuration
     * Includes PATH and other Docker-related environment variables
     */
    private buildDockerEnvironment(): NodeJS.ProcessEnv {
        const customEnv = { ...process.env }
        
        // Get platform-specific paths
        const platformPaths = DEFAULT_DOCKER_PATHS[process.platform as keyof typeof DEFAULT_DOCKER_PATHS] || []
        
        // Build PATH environment variable
        let pathsToAdd: string[] = []

        // First check if DOCKER_PATH is explicitly set
        if (process.env.DOCKER_PATH) {
            pathsToAdd.push(path.dirname(process.env.DOCKER_PATH))
        }

        // Add platform-specific default paths
        pathsToAdd.push(...platformPaths.map(p => path.dirname(p)))

        // Get existing PATH
        const existingPath = process.env.PATH || ''

        // Combine paths
        const newPath = [...new Set([...pathsToAdd, ...existingPath.split(path.delimiter)])].join(path.delimiter)

        // Update environment
        customEnv.PATH = newPath

        // Add other Docker-related environment variables if they exist
        if (process.env.DOCKER_HOST) customEnv.DOCKER_HOST = process.env.DOCKER_HOST
        if (process.env.DOCKER_TLS_VERIFY) customEnv.DOCKER_TLS_VERIFY = process.env.DOCKER_TLS_VERIFY
        if (process.env.DOCKER_CERT_PATH) customEnv.DOCKER_CERT_PATH = process.env.DOCKER_CERT_PATH

        return customEnv
    }

    /**
     * Returns singleton instance of BrowserManager
     * Creates new instance if one doesn't exist
     */
    public static getInstance(config: Config, logger: Logger): BrowserManager {
        if (!BrowserManager._instance) {
            BrowserManager._instance = new BrowserManager(config, logger);
        }
        return BrowserManager._instance;
    }

    /**
     * Initializes the BrowserManager
     * Checks Docker availability and sets up initial browser containers
     * @throws Error if Docker is not running after max attempts
     */
    public async init(pullOnStart: boolean = false): Promise<void> {
        // Check if docker is running with retries
        let dockerRunning = false;
        let dockerCheckAttempts = 0;
        let dockerCheckTimeout = 5000;
        while (!dockerRunning && dockerCheckAttempts < 50) {
            try {
                await Promise.race([
                    this._docker.command("info"),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Docker info command timed out')), dockerCheckTimeout)
                    )
                ]);
                dockerRunning = true;
                this._logger.info('Docker is running');
            } catch (err) {
                dockerCheckAttempts++;
                this._logger.warn({ attempt: dockerCheckAttempts }, 'Docker not ready, retrying...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        if(!dockerRunning) {
            throw new Error("Docker is not running")
        }

        // Pull Image 
        if(pullOnStart) {
            await this._docker.command(`pull ${this._config.browserImageName}`)
        }

        for (let i = 0; i < this._config.numBrowsers; i++) {
            const browserName = `${this._config.browserPrefix}-${this._config.baseBrowserPort + i}`
            this._browsers[browserName] = {
                name: browserName,
                index: i,
                isUp: false,
                isRemoving: false,
                lastUsed: -1,
                createdAt: Date.now(),
                leaseTime: -1,
                isDebug: false,
                viewport: this._config.resolution,
                ports: {
                    vnc: this._config.baseBrowserVncPort + i,
                    app: this._config.baseBrowserAppPort + i,
                    browser: this._config.baseBrowserPort + i
                },
                labels: {},
                webhook: "",
                sessionID: "",
                clientID: "",
                fingerprintID: "",
                sessionUUID: "",
                reportKey: ""
            }
    
            try {
                await this._docker.command(`kill ${browserName}`)
            } catch (e) {}
    
            await this.initContainer(browserName, i, `${this._config.resolution.width}x${this._config.resolution.height}`, true)
        }
    }

    public async getBrowsers(): Promise<Browser[]> {
        return Object.values(this._browsers);
    }

    public async addBrowser(browser: Browser): Promise<void> {
        this._browsers[browser.name] = browser;
    }

    public async removeBrowser(browserName: string): Promise<void> {
        delete this._browsers[browserName];
    }

    public async updateBrowser(browserName: string, updates: Partial<Browser>): Promise<void> {
        if (this._browsers[browserName]) {
            this._browsers[browserName] = { ...this._browsers[browserName], ...updates };
        }
    }

    public async reInitContainerWithCustomResolution(
        browserName: string, 
        resolution:  "1280x1024" | "1920x1080" | "1366x768" | "1536x864" | "1280x720" | "1440x900" | "1280x2400"
    ): Promise<void> {
        // Kill
        await this.killBrowser(browserName, 0)

        // Reinitialize
        await this.initContainer(
            browserName, 
            this._browsers[browserName].index, 
            resolution,
            true
        )
    }

    /**
     * Initializes a browser container with specified configuration
     * @param browserName - Name of the browser container
     * @param index - Index in the browser pool
     * @param resolution - Screen resolution (e.g., "1920x1080")
     * @param shouldCrashIfFailed - Whether to throw error on failure
     */
    public async initContainer(
        browserName: string, 
        index: number, 
        resolution : string,
        shouldCrashIfFailed: boolean = false,
    ): Promise<void> {
        const start = Date.now();
        let attempts = 0;
        
        // Support for additional launch arguments
        const launchArgs: Record<string, string> = this._config.launchArgs || {};
        const envs = {
            XVFB_RESOLUTION: resolution,
            VNC_NO_SSL: 'true',
            STUNNEL_HTTP: 'true',
            REPORT_STATE: 'false',
            ...launchArgs  // Merge any additional launch arguments
        }

        const ports = {
            '8080': String(this._config.baseBrowserAppPort + index),
            '19222': String(this._config.baseBrowserPort + index),
            '15900': String(this._config.baseBrowserVncPort + index)
        }

        let additionalDockerArgs = ""
        if(this._config.additionalDockerArgs) {
            additionalDockerArgs = Object.entries(this._config.additionalDockerArgs).map(([key, value]) => `--${key}=${value}`).join(' ')
        }

        const dockerCommand = `run -d --pull never --rm ${additionalDockerArgs} --name ${browserName} ${
            Object.entries(envs).map(([key, value]) => `-e ${key}=${value}`).join(' ')
        } ${
            Object.entries(ports).map(([container, host]) => `-p ${host}:${container}`).join(' ')
        } ${this._config.browserImageName}`;

        this._logger.info({ browserName, command: dockerCommand }, 'Initializing container');

        // Creating container with retries
        while (attempts < this._config.maxRetries) {
            try {
                this._logger.info({ browserName, attempt: attempts + 1 }, 'CREATING_CONTAINER');
                
                await this._docker.command(dockerCommand);

                this._logger.info(
                    { browserName, duration: Date.now() - start },
                    'CREATED_CONTAINER'
                );
                break; // Success - exit the retry loop
            } catch (err) {
                attempts++;
                this._logger.error(
                    { browserName, error: err, attempt: attempts },
                    'ERROR_CREATING_CONTAINER'
                );

                if (attempts === this._config.maxRetries) {
                    if (shouldCrashIfFailed) {
                        throw new Error(`Failed to create container ${browserName} after ${this._config.maxRetries} attempts`);
                    }
                    break;
                }

                // Wait before retrying (using the same killWaitTime config)
                await new Promise(resolve => setTimeout(resolve, this._config.killWaitTime));
            }
        }

        await this.connectToBrowser(browserName, index);
    }

    /**
     * Establishes WebSocket connection to browser container
     * Handles various browser events and state updates
     */
    private async connectToBrowser(browserName: string, index: number): Promise<void> {
        try {
            const socket = io(`http://localhost:${this._config.baseBrowserAppPort + index}`, {
                reconnection: true,
                reconnectionAttempts: 15,
                reconnectionDelay: 1000,
                timeout: 5000,
            });

            socket.on('connect', () => {
                this._logger.info({ browserName }, 'SOCKET_CONNECT');
            });

            socket.on('disconnect', () => {
                this._logger.info({ browserName }, 'SOCKET_DISCONNECTED');
                this.resetTimeout(browserName)

                // Non-blocking reinitialization after 2 seconds
                this._browsers[browserName].isUp = false
                if(!this._isKilling) {
                    setTimeout(() => {
                        this.initContainer(
                            browserName,
                            index,
                            `${this._config.resolution.width}x${this._config.resolution.height}`
                        )
                    }, 2000);
                }
            });

            socket.on('connect_error', (error) => {
                this._logger.warn({ browserName, error: error.message }, 'SOCKET_ERROR');
            });

            socket.on('browser:container:event', async (event) => {
                if(!this._browsers[browserName]){
                    this._logger.warn({ browserName, event }, 'BROWSER_NOT_FOUND');
                    return
                }

                if (!this._browsers[browserName].labels) {
                    this._browsers[browserName].labels = {};
                }

                if(event.name === "node:setState") {
                    const { id, ip } = event.data;
                    this._browsers[browserName].labels["id"] = id;
                    this._browsers[browserName].labels["ip"] = ip;
                    this._browsers[browserName].isUp = true;
                } else if (event.name === "node:setLabel") {
                    const { labelName, labelValue } = event.data;
                    this._browsers[browserName].labels[labelName] = labelValue;
                } else if (event.name === "node:setParam") {
                    const { param, value } = event.data;
                    this._browsers[browserName].labels[param] = value;
                } else if (event.name === "node:deleted") {
                    const { isError, message } = event.data;
                    try {
                        if(this._browsers[browserName].sessionID && this._browsers[browserName].clientID){
                            let sessionData = ""
                            // Log
                            this._logger.info({ browserName, event }, 'NODE_DELETED');

                            // Get SessionData if fingerprintID is present
                            if(this._browsers[browserName].fingerprintID) {
                                sessionData = event.data.sessionData
                            }
                        
                            // Report Result 
                            // only if callbackURL is present
                            if(
                                this._browsers[browserName].webhook && this._browsers[browserName].webhook !== "" && 
                                this._browsers[browserName].reportKey && this._browsers[browserName].reportKey !== "" &&
                                this._browsers[browserName].sessionUUID && this._browsers[browserName].sessionUUID !== ""
                            ) {
                                try {
                                    console.log("logging report data", {
                                        clientID: this._browsers[browserName].clientID,
                                        sessionUUID: this._browsers[browserName].sessionUUID,
                                        sessionData: sessionData,
                                        isError: isError,
                                        error: message,
                                        reportKey: this._browsers[browserName].reportKey,
                                    })
                                    await axios.post(this._browsers[browserName].webhook, {
                                        clientID: this._browsers[browserName].clientID,
                                        sessionUUID: this._browsers[browserName].sessionUUID,
                                        sessionData: sessionData,
                                        isError: isError,
                                        error: message,
                                        reportKey: this._browsers[browserName].reportKey,
                                    }, {
                                        headers: {
                                            "Content-Type": "application/json"
                                        }
                                    })
                                } catch (error) {}
                            }
                        }
                    } catch (error) {}
                }
            });

            this._sockets[browserName] = socket;
        } catch (error) {
            // Log the error but don't throw
            this._logger.warn({ browserName, error }, 'FAILED_TO_INIT_SOCKET');
        }
    }

    public async getBrowserWithId(id:string) : Promise<Browser | undefined> {
        const browser = Object.values(this._browsers).find((b)=> b.labels?.id === id)
        return browser
    }

    public async getBrowserWithSessionId(sessionId:string) : Promise<Browser | undefined> {
        const browser = Object.values(this._browsers).find((b)=> b.sessionID === sessionId)
        return browser
    }
    
    public async killAllExisting() {
        this._logger.info(`Killing All existing browsers`)
        this._isKilling = true
        
        for(const browserName in this._browsers) {
            await this.killBrowser(browserName, 0)
        }
    }

    /**
     * Kills a browser container and cleans up associated resources
     * Implements retry logic for reliability
     */
    public async killBrowser(browserName: string, tryNum: number = 0): Promise<void> {        
        try {
            if(!this._browsers[browserName]) {
                return
            }
    
            if(tryNum === 0) {
                this._browsers[browserName].isRemoving = true
            }

            // Clear any timeout objects
            this.resetTimeout(browserName)

            // Kill the container
            await this._docker.command(`stop ${browserName}`);
            this._logger.info({ browserName }, 'KILLED_CONTAINER');
            
            // Clean up socket connection if it exists
            if (this._sockets[browserName]) {
                this._sockets[browserName].disconnect();
                delete this._sockets[browserName];
            }

            // Remove from local state
            this._browsers[browserName] = {
                ...this._browsers[browserName],
                isUp: false,
                isRemoving: false,
                lastUsed: -1,
                createdAt: Date.now(),
                leaseTime: -1,
                labels: {},
                webhook: "",
                sessionID: "",
                clientID: "",
                fingerprintID: "",
                sessionUUID: "",
                reportKey: ""
            }

            this._logger.info({ browserName }, 'Successfully killed browser');
        } catch (error:unknown) {
            // Ignore "no such container" errors since the container is already gone
            if(error instanceof Error) {
                if (error.toString().toLowerCase().includes('no such container')) {
                    this._logger.info({ browserName }, 'Container already removed');
                    return;
                }
            }

            this._logger.error({ browserName, error, tryNum }, 'Error killing browser');
            
            // Retry logic
            if (tryNum < this._config.maxRetries) {
                this._logger.info({ browserName, tryNum: tryNum + 1 }, 'Retrying kill browser');
                await new Promise(resolve => setTimeout(resolve, this._config.killWaitTime)); // Wait 1 second before retry
                return this.killBrowser(browserName, tryNum + 1);
            }
            
            throw error;
        }
    }

    /**
     * Reserves an available browser for use
     * @param leaseTime - Duration in minutes to reserve the browser
     * @returns Reserved browser instance
     * @throws Error if no browsers are available
     */
    public async reserveBrowser(leaseTime: number): Promise<Browser | undefined> {
        // Select random browser that is available
        const browser = Object.values(this._browsers).find((b)=> b.isUp && b.leaseTime === -1)
        if(!browser) {
            return undefined
        }

        // Update browser state
        this._browsers[browser.name].leaseTime = leaseTime
        this.setTimeout(browser.name, leaseTime)
        return browser
    }

    public async resetTimeout(browserName: string) {
        if(this._timeoutObjs[browserName]) {
            clearTimeout(this._timeoutObjs[browserName])
        }
    }

    public async setTimeout(browserName: string, timeout: number) {
        // Store reference to this for clarity
        this._browsers[browserName].lastUsed = Date.now()
        this._timeoutObjs[browserName] = setTimeout(
            async (self) => {
                await self.killBrowser(browserName, 0)
            },
            timeout * 60000,
            this
        )
    }

    /**
     * Sets internal properties for a browser instance
     * Used for tracking session and client information
     */
    public async setInternals(browserName: string, internals: {
        sessionID: string
        clientID: string
        webhook?: string,
        fingerprintID?: string,
        driver?: string,
        reportKey?: string,
        sessionUUID?: string
    }) {
        this._browsers[browserName].sessionID = internals.sessionID
        this._browsers[browserName].clientID = internals.clientID
        this._browsers[browserName].webhook = internals.webhook
        this._browsers[browserName].fingerprintID = internals.fingerprintID
        this._browsers[browserName].driver = internals.driver
        this._browsers[browserName].reportKey = internals.reportKey
        this._browsers[browserName].sessionUUID = internals.sessionUUID
    }

    public async setVncPassword(browserName: string, vncPassword: string) {
        this._browsers[browserName].vncPassword = vncPassword
    }

    public async setDebug(browserName: string, isDebug: boolean) {
        this._browsers[browserName].isDebug = isDebug
    }

    public async setViewport(browserName: string, viewport: {
        width: number
        height: number
    }) {
        this._browsers[browserName].viewport = viewport
    }

    public async setDefaultViewport(browserName: string) {
        this._browsers[browserName].viewport = this._config.resolution
    }
}
