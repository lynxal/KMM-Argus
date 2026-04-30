plugins { base }

// Android Studio launches Gradle without the shell rc files, so `npm` (managed
// by nvm/Homebrew) usually isn't on PATH. Resolve it from a few well-known
// locations and fall back to the bare command if we're in a shell that has it.
val npmCmd: String = run {
    val home = System.getProperty("user.home")
    val candidates = mutableListOf<String>()
    System.getenv("NPM_BIN")?.let(candidates::add)
    val nvmDir = file("$home/.nvm/versions/node")
    if (nvmDir.isDirectory) {
        nvmDir.listFiles()
            ?.filter { it.isDirectory }
            ?.sortedByDescending { it.name }
            ?.forEach { candidates += "${it.absolutePath}/bin/npm" }
    }
    candidates += "/opt/homebrew/bin/npm"
    candidates += "/usr/local/bin/npm"
    candidates.firstOrNull { file(it).canExecute() } ?: "npm"
}

val npmCi = tasks.register<Exec>("npmCi") {
    group = "build"
    description = "Runs npm ci to install pinned dependencies."
    workingDir = projectDir
    commandLine(npmCmd, "ci")
    inputs.file("package.json")
    inputs.file("package-lock.json")
    outputs.dir("node_modules")
}

val npmBuild = tasks.register<Exec>("npmBuild") {
    group = "build"
    description = "Runs npm run build to produce dist/."
    dependsOn(npmCi)
    workingDir = projectDir
    commandLine(npmCmd, "run", "build")
    inputs.file("package.json")
    inputs.file("package-lock.json")
    inputs.file("index.html")
    inputs.file("tailwind.config.ts")
    inputs.file("vite.config.ts")
    inputs.file("postcss.config.js")
    inputs.file("tsconfig.json")
    inputs.dir("src")
    inputs.dir("scripts")
    outputs.dir("dist")
}

tasks.named("assemble") { dependsOn(npmBuild) }

tasks.named<Delete>("clean") {
    delete("dist", "node_modules/.vite")
}
