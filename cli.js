#!/usr/bin/env node
import fs from "fs";
import zlib from "zlib";
import util from "util";
import { YM2610 } from "./ym2610b.js"

const gunzip = util.promisify(zlib.gunzip);
const gzip = util.promisify(zlib.gzip);

async function main() {
	if (process.argv.length < 5) {
		console.log("vgmtransmute CHIP input.vgm output.vgm");
		console.log();
		console.log("Target CHIPs:");
		console.log("  ym2610b");
		process.exit(1);
	}

	const chip = process.argv[2];
	const inputPath = process.argv[3];
	const outputPath = process.argv[4];

	if (chip == "ym2610b") {
		const ym2610 = new YM2610();
		ym2610.read(await readFile(inputPath));
		ym2610.optimize();
		await writeFile(outputPath, ym2610.write());
	} else {
		throw new Error(`Unknown chip: ${chip}`);
	}
}

async function readFile(path) {
	let buffer = await fs.promises.readFile(path);
	if (buffer[0] == 0x1F && buffer[1] == 0x8B) {  // gzip signature
		return await gunzip(buffer);
	}
	return buffer;
}

async function writeFile(path, buffer) {
	if (path.endsWith(".vgz") || path.endsWith(".gz")) {
		buffer = await gzip(buffer, { level: zlib.constants.Z_BEST_COMPRESSION });
	}
	await fs.promises.writeFile(path, buffer);
}

main().catch(reason => { throw reason; });
