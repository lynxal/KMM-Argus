package com.lynxal.argus.server.routes

import com.lynxal.argus.model.ARGUS_SCHEMA_VERSION
import com.lynxal.argus.model.AppInfo
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import kotlinx.serialization.Serializable

@Serializable
internal data class InfoResponse(
    val pkg: String,
    val versionName: String,
    val device: String,
    val argusVersion: String,
    val schemaVersion: Int,
)

internal fun Route.installInfoRoute(appInfo: AppInfo) {
    get("/api/info") {
        call.respond(
            HttpStatusCode.OK,
            InfoResponse(
                pkg = appInfo.pkg,
                versionName = appInfo.versionName,
                device = appInfo.device,
                argusVersion = appInfo.argusVersion,
                schemaVersion = ARGUS_SCHEMA_VERSION,
            ),
        )
    }
}
