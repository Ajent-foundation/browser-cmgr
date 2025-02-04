import { loadEnv } from "./env"
import { getArgs } from "./args"
import { main, shutdown } from "./index"

if (require.main === module) {
    (async () => {
        // I - Get Starting Args
        const args = getArgs<{
            debug: boolean,
            staging: boolean
        }>()

        // II- Load Env Vars
        loadEnv(
            args.debug ? "dev" : args.staging ? "staging" : "prod"
        )

        const { logger } = await main(args.debug ? "dev" : args.staging ? "staging" : "prod")

        // ShutdownHandlers
        // ctrl + c triggers  SIGINT & SIGTERM
        // K8s scheduler sends SIGTERM when killing a Pod
        process.on("SIGINT", async () => {
            await shutdown()
            process.exit(0)
        })
        process.on("SIGTERM", async () => {
            await shutdown()
            process.exit(0)
        })
        process.on("uncaughtException", async(error) => {
            logger.error(
                "Unhandled Exception", 
                {
                    message: error.message,
                    stack: error.stack
                }
            )

            await shutdown()
            process.exit(0)
        })
    })()
}