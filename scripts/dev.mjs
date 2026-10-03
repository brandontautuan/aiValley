// Starts the API server and the Vite dev server together; Ctrl+C stops both.
import { spawn } from "node:child_process";

const run = (script) => spawn("npm", ["run", script], { stdio: "inherit", shell: process.platform === "win32" });
const children = [run("dev:server"), run("dev:web")];

const stop = () => children.forEach((child) => child.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", (code) => { if (code) { stop(); process.exitCode = code; } }));
