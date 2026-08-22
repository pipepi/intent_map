/** Locates Cargo even when rustup's toolchain bin directory is absent from PATH. */
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export function resolveRustToolchain() {
  const direct = [process.env.CARGO, "cargo"].filter(Boolean);
  for (const cargo of direct) {
    if (spawnSync(cargo, ["--version"], { stdio: "ignore" }).status === 0) return { cargo, rustc: process.env.RUSTC ?? "rustc", env: process.env };
  }
  for (const rustup of ["rustup", "/opt/homebrew/bin/rustup", "/usr/local/bin/rustup"]) {
    if (rustup.includes("/") && !existsSync(rustup)) continue;
    const located = spawnSync(rustup, ["which", "cargo"], { encoding: "utf8" });
    const cargo = located.status === 0 ? located.stdout.trim() : "";
    if (!cargo) continue;
    const bin = dirname(cargo), rustc = join(bin, process.platform === "win32" ? "rustc.exe" : "rustc");
    const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, CARGO: cargo, RUSTC: rustc };
    if (process.platform === "darwin") env.DYLD_LIBRARY_PATH = `${join(dirname(bin), "lib")}${delimiter}${process.env.DYLD_LIBRARY_PATH ?? ""}`;
    return { cargo, rustc, env };
  }
  throw new Error("Cargo is unavailable; install it with rustup or set CARGO to its executable path.");
}
