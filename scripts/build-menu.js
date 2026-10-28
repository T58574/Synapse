#!/usr/bin/env node

/**
 * 0xPlay (0xSoundPlayer) — Interactive Build Console
 * Zero external dependencies: uses built-in Node.js modules only.
 */

const readline = require('readline');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BUILD_BIN_DIR = path.join(ROOT_DIR, 'build', 'bin');

// ANSI Color codes
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    gray: '\x1b[90m'
};

// Automatically locate and augment PATH with Go bin directories (where Wails CLI resides)
function augmentPathWithGoBins() {
    const candidates = [];

    // 1. Check via 'go env GOPATH' and 'go env GOBIN'
    try {
        const goEnvRes = spawnSync('go', ['env', 'GOPATH'], { encoding: 'utf8' });
        if (goEnvRes.status === 0 && goEnvRes.stdout) {
            const gopath = goEnvRes.stdout.trim().split(/[\r\n]+/)[0];
            if (gopath) candidates.push(path.join(gopath, 'bin'));
        }
    } catch {}

    try {
        const goBinRes = spawnSync('go', ['env', 'GOBIN'], { encoding: 'utf8' });
        if (goBinRes.status === 0 && goBinRes.stdout) {
            const gobin = goBinRes.stdout.trim().split(/[\r\n]+/)[0];
            if (gobin) candidates.push(gobin);
        }
    } catch {}

    // 2. Fallback to standard ~/go/bin
    const userHome = os.homedir();
    if (userHome) {
        candidates.push(path.join(userHome, 'go', 'bin'));
    }

    // 3. Inject into process.env.PATH if folder exists
    for (const dir of candidates) {
        if (dir && fs.existsSync(dir)) {
            const currentPath = process.env.PATH || '';
            if (!currentPath.toLowerCase().includes(dir.toLowerCase())) {
                process.env.PATH = `${dir}${path.delimiter}${currentPath}`;
            }
        }
    }
}

// Augment PATH immediately on load
augmentPathWithGoBins();

function printHeader() {
    console.log(`\n${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}   0xPlay (0xSoundPlayer) — Build Console & Orchestrator             ${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
    console.log(`${colors.gray} OS: ${os.type()} ${os.release()} (${os.arch()}) | Root: ${ROOT_DIR}${colors.reset}\n`);
}

function resolveBinary(cmd) {
    const isWindows = process.platform === 'win32';
    const extensions = isWindows ? ['.exe', '.cmd', '.bat', ''] : [''];

    // If direct match in augmented PATH
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
        if (!dir) continue;
        for (const ext of extensions) {
            const candidate = path.join(dir, cmd + ext);
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return cmd;
}

function checkTool(cmd, args = ['--version']) {
    try {
        const fullCmd = [cmd, ...args].join(' ');
        const res = spawnSync(fullCmd, {
            encoding: 'utf8',
            shell: true,
            env: process.env
        });
        if (res.status === 0 && res.stdout) {
            const firstLine = res.stdout.trim().split(/[\r\n]+/)[0];
            return { ok: true, version: firstLine };
        }
        return { ok: false, error: res.stderr ? res.stderr.trim().split(/[\r\n]+/)[0] : 'Command failed' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function runPreflightDoctor() {
    augmentPathWithGoBins();
    console.log(`${colors.bold}${colors.magenta}--- Pre-flight Toolchain Diagnostic ---${colors.reset}\n`);

    const tools = [
        { name: 'Node.js', cmd: 'node', args: ['-v'] },
        { name: 'npm', cmd: 'npm', args: ['-v'] },
        { name: 'Go Runtime', cmd: 'go', args: ['version'] },
        { name: 'Wails CLI v2', cmd: 'wails', args: ['version'] },
        { name: 'C/C++ Compiler (GCC)', cmd: 'gcc', args: ['--version'] },
        { name: 'C/C++ Compiler (G++)', cmd: 'g++', args: ['--version'] }
    ];

    let allOk = true;

    for (const t of tools) {
        const result = checkTool(t.cmd, t.args);
        if (result.ok) {
            console.log(`  ${colors.green}[OK]${colors.reset}   ${colors.bold}${t.name.padEnd(24)}${colors.reset} : ${colors.gray}${result.version}${colors.reset}`);
        } else {
            console.log(`  ${colors.red}[MISSING]${colors.reset} ${colors.bold}${t.name.padEnd(24)}${colors.reset} : ${colors.yellow}Not found in PATH${colors.reset}`);
            if (t.name.includes('Wails')) {
                console.log(`         ${colors.cyan}-> Quick fix: run 'go install github.com/wailsapp/wails/v2/cmd/wails@latest'${colors.reset}`);
                console.log(`         ${colors.dim}-> (or select option [w] in this menu)${colors.reset}`);
                allOk = false;
            }
            if (t.name.includes('GCC')) {
                console.log(`         ${colors.dim}-> Requires GCC/MinGW-w64 with CGO enabled for miniaudio/Signalsmith${colors.reset}`);
                allOk = false;
            }
        }
    }

    // Check frontend dependencies
    const nodeModulesExist = fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'));
    if (nodeModulesExist) {
        console.log(`  ${colors.green}[OK]${colors.reset}   ${colors.bold}${'Frontend node_modules'.padEnd(24)}${colors.reset} : ${colors.gray}Installed${colors.reset}`);
    } else {
        console.log(`  ${colors.yellow}[WARN]${colors.reset} ${colors.bold}${'Frontend node_modules'.padEnd(24)}${colors.reset} : ${colors.yellow}Not installed yet (run 'npm install' in frontend)${colors.reset}`);
    }

    console.log('');
    return allOk;
}

function installWailsCLI() {
    console.log(`\n${colors.cyan}${colors.bold}Installing Wails CLI v2 via Go...${colors.reset}\n`);
    const success = executeCommand('go', ['install', 'github.com/wailsapp/wails/v2/cmd/wails@latest']);
    if (success) {
        augmentPathWithGoBins();
        const check = checkTool('wails', ['version']);
        if (check.ok) {
            console.log(`${colors.green}${colors.bold}[SUCCESS] Wails installed successfully: ${check.version}${colors.reset}\n`);
            return true;
        } else {
            console.log(`${colors.yellow}Wails installed, but binary not detected in PATH yet.${colors.reset}`);
            console.log(`${colors.dim}Check that %USERPROFILE%\\go\\bin is in your system PATH.${colors.reset}\n`);
        }
    }
    return false;
}

function ensureWailsAvailable() {
    augmentPathWithGoBins();
    const check = checkTool('wails', ['version']);
    if (check.ok) return true;

    console.log(`\n${colors.yellow}${colors.bold}[!] Wails CLI is not found in PATH or GOPATH/bin.${colors.reset}`);
    console.log(`Attempting automatic installation via 'go install'...\n`);
    const installed = installWailsCLI();
    return installed;
}

function executeCommand(command, args = [], cwd = ROOT_DIR, env = process.env) {
    augmentPathWithGoBins();

    // Prevent DEP0190: Concatenate command string when using shell execution
    const fullCommandLine = [command, ...args].join(' ');
    console.log(`${colors.cyan}> ${fullCommandLine}${colors.reset} ${colors.dim}(in ${path.relative(ROOT_DIR, cwd) || '.'})${colors.reset}`);
    const startTime = Date.now();

    const res = spawnSync(fullCommandLine, {
        cwd,
        env: { ...env, CGO_ENABLED: '1', PATH: process.env.PATH },
        stdio: 'inherit',
        shell: true
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (res.status === 0) {
        console.log(`\n${colors.green}${colors.bold}[SUCCESS] Finished in ${elapsed}s${colors.reset}\n`);
        return true;
    } else {
        console.log(`\n${colors.red}${colors.bold}[FAILED] Exited with code ${res.status} (${elapsed}s)${colors.reset}\n`);
        return false;
    }
}

function printBinaryArtifacts() {
    if (!fs.existsSync(BUILD_BIN_DIR)) return;
    try {
        const files = fs.readdirSync(BUILD_BIN_DIR);
        if (files.length > 0) {
            console.log(`${colors.bold}${colors.green}Generated Binaries in ${BUILD_BIN_DIR}:${colors.reset}`);
            for (const file of files) {
                const fullPath = path.join(BUILD_BIN_DIR, file);
                const stat = fs.statSync(fullPath);
                const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
                console.log(`  -> ${colors.bold}${file}${colors.reset} (${sizeMb} MB)`);
            }
            console.log('');
        }
    } catch {}
}

function cleanArtifacts() {
    console.log(`${colors.yellow}Cleaning build artifacts...${colors.reset}`);

    const targets = [
        BUILD_BIN_DIR,
        path.join(FRONTEND_DIR, 'dist'),
        path.join(ROOT_DIR, 'build', 'windows'),
        path.join(ROOT_DIR, 'build', 'darwin'),
        path.join(ROOT_DIR, 'build', 'linux')
    ];

    for (const target of targets) {
        if (fs.existsSync(target)) {
            try {
                fs.rmSync(target, { recursive: true, force: true });
                console.log(`  ${colors.dim}Deleted ${path.relative(ROOT_DIR, target)}${colors.reset}`);
            } catch (err) {
                console.log(`  ${colors.red}Failed to remove ${target}: ${err.message}${colors.reset}`);
            }
        }
    }
    console.log(`${colors.green}Clean completed.${colors.reset}\n`);
}

function printMenu() {
    console.log(`${colors.bold}Available Build & Test Operations:${colors.reset}\n`);
    console.log(`  ${colors.green}[1]${colors.reset} ${colors.bold}Production Build (Native / Current Platform)${colors.reset}  ${colors.dim}[wails build]${colors.reset}`);
    console.log(`  ${colors.green}[2]${colors.reset} ${colors.bold}Windows Production Build (x64 .exe)${colors.reset}           ${colors.dim}[wails build -platform windows/amd64]${colors.reset}`);
    console.log(`  ${colors.green}[3]${colors.reset} ${colors.bold}Linux Production Build (x64 ELF)${colors.reset}              ${colors.dim}[wails build -platform linux/amd64]${colors.reset}`);
    console.log(`  ${colors.green}[4]${colors.reset} ${colors.bold}Compressed Build with UPX (-upx)${colors.reset}             ${colors.dim}[wails build -upx]${colors.reset}`);
    console.log(`  ${colors.green}[5]${colors.reset} ${colors.bold}Debug Build with DevTools (-debug)${colors.reset}           ${colors.dim}[wails build -debug]${colors.reset}`);
    console.log(`  ${colors.cyan}[6]${colors.reset} ${colors.bold}Build Frontend Only (Vite + TypeScript check)${colors.reset} ${colors.dim}[npm run build in frontend/]${colors.reset}`);
    console.log(`  ${colors.cyan}[7]${colors.reset} ${colors.bold}Run Test Suite (Backend & Frontend)${colors.reset}          ${colors.dim}[go test & vitest]${colors.reset}`);
    console.log(`  ${colors.yellow}[8]${colors.reset} ${colors.bold}Clean Build Artifacts (bin / dist)${colors.reset}          ${colors.dim}[remove artifacts]${colors.reset}`);
    console.log(`  ${colors.magenta}[9]${colors.reset} ${colors.bold}Pre-flight Doctor / Dependency Check${colors.reset}       ${colors.dim}[verify toolchain]${colors.reset}`);
    console.log(`  ${colors.blue}[w]${colors.reset} ${colors.bold}Install / Update Wails CLI${colors.reset}                 ${colors.dim}[go install wails@latest]${colors.reset}`);
    console.log(`  ${colors.red}[0]${colors.reset} ${colors.bold}Exit${colors.reset}\n`);
}

async function handleAction(choice) {
    const act = choice.trim().toLowerCase();
    switch (act) {
        case '1': {
            if (!ensureWailsAvailable()) return;
            console.log(`\n${colors.bold}Starting Production Build for current platform...${colors.reset}\n`);
            const ok = executeCommand('wails', ['build', '-clean']);
            if (ok) printBinaryArtifacts();
            break;
        }
        case '2': {
            if (!ensureWailsAvailable()) return;
            console.log(`\n${colors.bold}Starting Windows x64 Build...${colors.reset}\n`);
            const ok = executeCommand('wails', ['build', '-platform', 'windows/amd64', '-clean']);
            if (ok) printBinaryArtifacts();
            break;
        }
        case '3': {
            if (!ensureWailsAvailable()) return;
            console.log(`\n${colors.bold}Starting Linux x64 Build...${colors.reset}\n`);
            const ok = executeCommand('wails', ['build', '-platform', 'linux/amd64', '-clean']);
            if (ok) printBinaryArtifacts();
            break;
        }
        case '4': {
            if (!ensureWailsAvailable()) return;
            console.log(`\n${colors.bold}Starting Production Build with UPX compression...${colors.reset}\n`);
            const ok = executeCommand('wails', ['build', '-clean', '-upx']);
            if (ok) printBinaryArtifacts();
            break;
        }
        case '5': {
            if (!ensureWailsAvailable()) return;
            console.log(`\n${colors.bold}Starting Debug Build (with Web Inspector)...${colors.reset}\n`);
            const ok = executeCommand('wails', ['build', '-debug']);
            if (ok) printBinaryArtifacts();
            break;
        }
        case '6': {
            console.log(`\n${colors.bold}Building Frontend Bundle...${colors.reset}\n`);
            executeCommand('npm', ['run', 'build'], FRONTEND_DIR);
            break;
        }
        case '7': {
            console.log(`\n${colors.bold}Running Full Test Suite...${colors.reset}\n`);
            console.log(`${colors.cyan}[1/2] Backend Go Tests${colors.reset}`);
            executeCommand('go', ['test', './...']);
            console.log(`\n${colors.cyan}[2/2] Frontend Vitest Tests${colors.reset}`);
            executeCommand('npm', ['run', 'test'], FRONTEND_DIR);
            break;
        }
        case '8': {
            cleanArtifacts();
            break;
        }
        case '9': {
            runPreflightDoctor();
            break;
        }
        case 'w': {
            installWailsCLI();
            break;
        }
        case '0':
        case 'q':
        case 'exit': {
            console.log(`\n${colors.cyan}Farewell! Happy listening and building! (o˘◡˘o)${colors.reset}\n`);
            process.exit(0);
        }
        default: {
            console.log(`\n${colors.red}Invalid option "${choice}". Choose between 0-9 or 'w'.${colors.reset}\n`);
            break;
        }
    }
}

async function startInteractiveLoop() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = () => {
        rl.question(`${colors.bold}${colors.green}Select an action [0-9, w]: ${colors.reset}`, async (answer) => {
            await handleAction(answer);
            console.log(`${colors.dim}----------------------------------------------------------------------${colors.reset}`);
            printMenu();
            ask();
        });
    };

    printHeader();
    printMenu();
    ask();
}

// CLI argument parsing for non-interactive automation
const args = process.argv.slice(2);
if (args.length > 0) {
    const flag = args[0];
    switch (flag) {
        case '--build':
        case '-b':
            printHeader();
            handleAction('1').then(() => process.exit(0));
            break;
        case '--windows':
            printHeader();
            handleAction('2').then(() => process.exit(0));
            break;
        case '--linux':
            printHeader();
            handleAction('3').then(() => process.exit(0));
            break;
        case '--upx':
            printHeader();
            handleAction('4').then(() => process.exit(0));
            break;
        case '--debug':
            printHeader();
            handleAction('5').then(() => process.exit(0));
            break;
        case '--frontend':
            printHeader();
            handleAction('6').then(() => process.exit(0));
            break;
        case '--test':
        case '-t':
            printHeader();
            handleAction('7').then(() => process.exit(0));
            break;
        case '--clean':
            printHeader();
            handleAction('8').then(() => process.exit(0));
            break;
        case '--doctor':
        case '--check':
            printHeader();
            runPreflightDoctor();
            process.exit(0);
            break;
        case '--install-wails':
            printHeader();
            installWailsCLI();
            process.exit(0);
            break;
        case '--help':
        case '-h':
            printHeader();
            console.log(`Usage: node scripts/build-menu.js [options]\n`);
            console.log(`Options:`);
            console.log(`  (no args)          Launch interactive Build Console`);
            console.log(`  --build, -b        Run native production build`);
            console.log(`  --windows          Run Windows x64 build`);
            console.log(`  --linux            Run Linux x64 build`);
            console.log(`  --upx              Build with UPX compression`);
            console.log(`  --debug            Build in debug mode`);
            console.log(`  --frontend         Build frontend only`);
            console.log(`  --test, -t         Run backend and frontend tests`);
            console.log(`  --clean            Clean build outputs`);
            console.log(`  --doctor           Run pre-flight environment checks`);
            console.log(`  --install-wails    Install Wails CLI v2 via go install`);
            process.exit(0);
        default:
            console.error(`Unknown argument: ${flag}. Use --help for usage.`);
            process.exit(1);
    }
} else {
    startInteractiveLoop();
}
