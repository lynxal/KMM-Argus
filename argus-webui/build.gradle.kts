plugins { base }

val npmCi = tasks.register<Exec>("npmCi") {
    group = "build"
    description = "Runs npm ci to install pinned dependencies."
    workingDir = projectDir
    commandLine("npm", "ci")
    inputs.file("package.json")
    inputs.file("package-lock.json")
    outputs.dir("node_modules")
}

val npmBuild = tasks.register<Exec>("npmBuild") {
    group = "build"
    description = "Runs npm run build to produce dist/."
    dependsOn(npmCi)
    workingDir = projectDir
    commandLine("npm", "run", "build")
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
