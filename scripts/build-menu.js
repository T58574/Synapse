#!/usr/bin/env node

/**
 * Synapse — Interactive Build Console (Rust + Slint + C++ DSP)
 * Zero external dependencies: uses built-in Node.js modules only.
 */

const readline = require('readline');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const TARGET_RELEASE_DIR = path.join(ROOT_DIR, 'target', 'release');
const TARGET_DEBUG_DIR = path.join(ROOT_DIR, 'target', 'debug');

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

// Augment PATH with common Windows GCC compiler locations
function augmentPathWithGcc() {
    if (process.platform !== 'win32') return;

    const userHome = os.homedir() || '';
    const localAppData = process.env.LOCALAPPDATA || (userHome ? path.join(userHome, 'AppData', 'Local') : '');

    const candidates = [
        path.join(ROOT_DIR, 'tools', 'w64devkit', 'bin'),
        'C:\\w64devkit\\bin',
        'C:\\msys64\\mingw64\\bin',
        'C:\\msys64\\ucrt64\\bin',
        'C:\\mingw64\\bin',
        'C:\\TDM-GCC-64\\bin',
        'C:\\ProgramData\\chocolatey\\bin',
        'C:\\tools\\msys64\\mingw64\\bin',
        userHome ? path.join(userHome, 'scoop', 'apps', 'gcc', 'current', 'bin') : '',
        userHome ? path.join(userHome, 'scoop', 'shims') : '',
        localAppData ? path.join(localAppData, 'Programs', 'w64devkit', 'bin') : ''
    ];

    for (const dir of candidates) {
        if (dir && fs.existsSync(dir)) {
            const gccExe = path.join(dir, 'gcc.exe');
            if (fs.existsSync(gccExe)) {
                const currentPath = process.env.PATH || '';
                if (!currentPath.toLowerCase().includes(dir.toLowerCase())) {
                    process.env.PATH = `${dir}${path.delimiter}${currentPath}`;
                }
                break;
            }
        }
    }
}

function augmentLinuxAudioLibs() {
    if (process.platform !== 'linux') return;
    const candidates = [
        '/usr/lib/x86_64-linux-gnu/libasound.so.2',
        '/lib/x86_64-linux-gnu/libasound.so.2',
        '/usr/lib/libasound.so.2'
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            const tmpLib = '/tmp/lib';
            const symlink = path.join(tmpLib, 'libasound.so');
            try {
                if (!fs.existsSync(tmpLib)) fs.mkdirSync(tmpLib, { recursive: true });
                if (!fs.existsSync(symlink)) fs.symlinkSync(candidate, symlink);
                const currentLib = process.env.LIBRARY_PATH || '';
                if (!currentLib.includes(tmpLib)) {
                    process.env.LIBRARY_PATH = currentLib ? `${tmpLib}:${currentLib}` : tmpLib;
                }
            } catch {}
            break;
        }
    }
}

augmentPathWithGcc();
augmentLinuxAudioLibs();

function printHeader() {
    console.log(`\n${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}   Synapse — Native Rust + Slint + C++ DSP Audio Workstation${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
    console.log(`${colors.gray} OS: ${os.type()} ${os.release()} (${os.arch()}) | Root: ${ROOT_DIR}${colors.reset}\n`);
}

function executeCommand(cmd, args, cwd = ROOT_DIR) {
    const fullCmd = [cmd, ...args].join(' ');
    console.log(`${colors.dim}> [exec] ${fullCmd}${colors.reset}\n`);

    const res = spawnSync(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env
    });

    if (res.error) {
        console.log(`\n${colors.red}${colors.bold}[FAIL] Execution error: ${res.error.message}${colors.reset}\n`);
        return false;
    }
    if (res.status !== 0) {
        console.log(`\n${colors.red}${colors.bold}[FAIL] Command exited with code: ${res.status}${colors.reset}\n`);
        return false;
    }
    return true;
}

function checkTool(cmd, args = ['--version']) {
    try {
        const res = spawnSync(cmd, args, {
            encoding: 'utf8',
            shell: process.platform === 'win32',
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
    console.log(`${colors.bold}${colors.magenta}--- Pre-flight Toolchain Diagnostic ---${colors.reset}\n`);

    const tools = [
        { name: 'Rust Compiler (rustc)', cmd: 'rustc', args: ['--version'] },
        { name: 'Cargo Package Manager', cmd: 'cargo', args: ['--version'] },
        { name: 'C/C++ Compiler (G++)', cmd: 'g++', args: ['--version'] },
        { name: 'C/C++ Compiler (GCC)', cmd: 'gcc', args: ['--version'] },
        { name: 'Slint Live Viewer', cmd: 'slint-viewer', args: ['--version'] }
    ];

    let allOk = true;

    for (const t of tools) {
        const result = checkTool(t.cmd, t.args);
        if (result.ok) {
            console.log(`  ${colors.green}[OK]${colors.reset}   ${colors.bold}${t.name.padEnd(26)}${colors.reset} : ${colors.gray}${result.version}${colors.reset}`);
        } else {
            if (t.name.includes('Slint Live Viewer')) {
                console.log(`  ${colors.yellow}[OPTIONAL]${colors.reset} ${colors.bold}${t.name.padEnd(24)}${colors.reset} : ${colors.yellow}Not installed (run 'cargo install slint-viewer' or option [7])${colors.reset}`);
            } else {
                console.log(`  ${colors.red}[MISSING]${colors.reset}  ${colors.bold}${t.name.padEnd(24)}${colors.reset} : ${colors.yellow}Not found in PATH${colors.reset}`);
                allOk = false;
            }
        }
    }

    console.log('');
    return allOk;
}

function printBinaryArtifacts() {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'synapse.exe' : 'synapse';
    const binaryPath = path.join(TARGET_RELEASE_DIR, binaryName);

    if (fs.existsSync(binaryPath)) {
        const stat = fs.statSync(binaryPath);
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
        console.log(`\n${colors.bold}${colors.green}>>> Generated Binary:${colors.reset}`);
        console.log(`    Location : ${colors.cyan}${binaryPath}${colors.reset}`);
        console.log(`    Size     : ${colors.bold}${sizeMb} MB${colors.reset} (native standalone, zero WebView)\n`);
    }
}

function cleanArtifacts() {
    console.log(`${colors.yellow}Cleaning Cargo build cache...${colors.reset}`);
    executeCommand('cargo', ['clean']);
    console.log(`${colors.green}Clean completed.${colors.reset}\n`);
}

function printMenu() {
    console.log(`${colors.bold}Available Build & Run Operations (Rust + Slint):${colors.reset}\n`);
    console.log(`  ${colors.green}[1]${colors.reset} ${colors.bold}Production Release Build${colors.reset}       ${colors.dim}[cargo build --release]${colors.reset}`);
    console.log(`  ${colors.green}[2]${colors.reset} ${colors.bold}Debug Build (Fast compile)${colors.reset}     ${colors.dim}[cargo build]${colors.reset}`);
    console.log(`  ${colors.cyan}[3]${colors.reset} ${colors.bold}Run Synapse (Release mode)${colors.reset}     ${colors.dim}[cargo run --release]${colors.reset}`);
    console.log(`  ${colors.cyan}[4]${colors.reset} ${colors.bold}Run Synapse (Debug mode)${colors.reset}       ${colors.dim}[cargo run]${colors.reset}`);
    console.log(`  ${colors.magenta}[5]${colors.reset} ${colors.bold}Run Full Test Suite${colors.reset}            ${colors.dim}[cargo test --bin synapse]${colors.reset}`);
    console.log(`  ${colors.blue}[6]${colors.reset} ${colors.bold}Slint Live UI Preview${colors.reset}          ${colors.dim}[slint-viewer -i ui/main.slint]${colors.reset}`);
    console.log(`  ${colors.blue}[7]${colors.reset} ${colors.bold}Install slint-viewer Tool${colors.reset}      ${colors.dim}[cargo install slint-viewer]${colors.reset}`);
    console.log(`  ${colors.yellow}[8]${colors.reset} ${colors.bold}Clean Build Artifacts${colors.reset}          ${colors.dim}[cargo clean]${colors.reset}`);
    console.log(`  ${colors.magenta}[9]${colors.reset} ${colors.bold}Pre-flight Doctor / Checks${colors.reset}     ${colors.dim}[verify rustc, cargo, g++]${colors.reset}`);
    console.log(`  ${colors.red}[0]${colors.reset} ${colors.bold}Exit${colors.reset}\n`);
}

async function handleAction(choice) {
    const act = choice.trim().toLowerCase();
    switch (act) {
        case '1': {
            console.log(`\n${colors.bold}Building Production Release...${colors.reset}\n`);
            const ok = executeCommand('cargo', ['build', '--release']);
            if (ok) printBinaryArtifacts();
            break;
        }
        case '2': {
            console.log(`\n${colors.bold}Building Debug Build...${colors.reset}\n`);
            executeCommand('cargo', ['build']);
            break;
        }
        case '3': {
            console.log(`\n${colors.bold}Launching Synapse in Release Mode...${colors.reset}\n`);
            executeCommand('cargo', ['run', '--release']);
            break;
        }
        case '4': {
            console.log(`\n${colors.bold}Launching Synapse in Debug Mode...${colors.reset}\n`);
            executeCommand('cargo', ['run']);
            break;
        }
        case '5': {
            console.log(`\n${colors.bold}Running Synapse Unit Test Suite...${colors.reset}\n`);
            executeCommand('cargo', ['test', '--bin', 'synapse']);
            break;
        }
        case '6': {
            console.log(`\n${colors.bold}Launching Slint Live Preview...${colors.reset}\n`);
            const viewerCheck = checkTool('slint-viewer', ['--version']);
            if (!viewerCheck.ok) {
                console.log(`${colors.yellow}slint-viewer is not installed. Installing via cargo...${colors.reset}\n`);
                executeCommand('cargo', ['install', 'slint-viewer']);
            }
            executeCommand('slint-viewer', ['-i', 'ui/main.slint']);
            break;
        }
        case '7': {
            console.log(`\n${colors.bold}Installing slint-viewer...${colors.reset}\n`);
            executeCommand('cargo', ['install', 'slint-viewer']);
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
        case '0':
        case 'q':
        case 'exit': {
            console.log(`\n${colors.cyan}Farewell! Pure Rust audio power! (o˘◡˘o)${colors.reset}\n`);
            process.exit(0);
        }
        default: {
            console.log(`\n${colors.red}Invalid option "${choice}". Choose between 0-9.${colors.reset}\n`);
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
        rl.question(`${colors.bold}${colors.green}Select an action [0-9]: ${colors.reset}`, async (answer) => {
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
        case '--debug':
        case '-d':
            printHeader();
            handleAction('2').then(() => process.exit(0));
            break;
        case '--run':
        case '-r':
            printHeader();
            handleAction('3').then(() => process.exit(0));
            break;
        case '--test':
        case '-t':
            printHeader();
            handleAction('5').then(() => process.exit(0));
            break;
        case '--preview':
        case '-p':
            printHeader();
            handleAction('6').then(() => process.exit(0));
            break;
        case '--doctor':
            printHeader();
            runPreflightDoctor();
            process.exit(0);
            break;
        case '--clean':
            cleanArtifacts();
            process.exit(0);
            break;
        default:
            console.log(`Unknown argument: ${flag}`);
            process.exit(1);
    }
} else {
    startInteractiveLoop();
}
