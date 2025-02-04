import { Router } from 'express'
import setResource from '../middlewares/setResource'

// Handlers
import defHandler from "../handlers"
import getBrowserHandler from "../handlers/default/getBrowser"
import freeBrowserHandler from "../handlers/default/freeBrowser"
import getAllBrowserHandler from "../handlers/default/getAll"

// The Routing Sheet
const GROUP = "default"
const ROUTES_TABLE = Router()

// The Routing Sheet
ROUTES_TABLE.get(
	'',
    setResource(GROUP),
    defHandler
)

ROUTES_TABLE.get(
	"/detailedStatus",
    setResource(GROUP),
    getAllBrowserHandler
)

ROUTES_TABLE.post(
	"/getBrowser",
    setResource(GROUP),
    getBrowserHandler
)

ROUTES_TABLE.post(
	"/freeBrowser",
    setResource(GROUP),
    freeBrowserHandler
)

export default ROUTES_TABLE