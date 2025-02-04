export function getArgs<T>() : T {
    const args: Record<string, string|boolean> = {}

    let index = 0
    let prvArg = ""
    for (let arg of process.argv) {
        if(index > 1) {
            const isFlag = arg.startsWith("--")
            if(isFlag) {
                let argStr = arg.replace("--", "").split("")
                let jIndex = 0
                for (let letter of argStr) {
                    if(jIndex===0) {
                        argStr[jIndex] = letter.toLowerCase()
                    } else if(argStr[jIndex-1]==="-") {
                        argStr[jIndex] = letter.toUpperCase()
                    }
                    jIndex++
                }

                // By default flag is assumed to be true and of type bool 
                // (if it is present in the args list)
                arg = argStr.join("").replace(/-/g, "")
                args[arg] = true
                prvArg = arg
            } else {
                if(prvArg==="") {
                    throw new Error(`Invalid argument: ${arg}`)
                }

                // Assign actual value to the flag
                args[prvArg] = arg
            }
        }
        index++
    }

    return args as T
}