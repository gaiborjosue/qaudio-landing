import "server-only"
import { readZernioConfig, zernioInstagramStatus } from "./zernio-api"

/** Call only after getAdmin(); the site shares one server-configured profile. */
export async function instagramStatus() {
  return zernioInstagramStatus(readZernioConfig())
}
