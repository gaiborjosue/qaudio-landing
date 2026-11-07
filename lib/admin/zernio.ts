import "server-only"
import { readZernioConfig, zernioInstagramStatus } from "./zernio-api"
import { zernioGoogleBusinessStatus } from "./google-business-api"

/** Call only after getAdmin(); the site shares one server-configured profile. */
export async function instagramStatus() {
  return zernioInstagramStatus(readZernioConfig())
}

/** Call only after getAdmin(). */
export async function googleBusinessStatus() {
  return zernioGoogleBusinessStatus(readZernioConfig())
}
