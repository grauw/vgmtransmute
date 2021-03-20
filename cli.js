#!/usr/bin/env node
import fs from "fs";
import zlib from "zlib";
import util from "util";
import { YM2610VGM } from "./ym2610b.js"

const gunzip = util.promisify(zlib.gunzip);
const gzip = util.promisify(zlib.gzip);

async function main() {
	const cli = new CLI();
	cli.parse(process.argv);

	if (!cli.outputPath) {
		console.log("vgmtransmute [options] CHIP input.vgm output.vgm");
		console.log();
		console.log("Target CHIPs:");
		console.log("  ym2610b");
		console.log();
		console.log("Options:");
		console.log("  -sa  SSG attenuation in dB.");
		process.exit(1);
	}

	if (cli.chip == "ym2610b") {
		const vgm = new YM2610VGM();
		vgm.read(await readFile(cli.inputPath));
		vgm.convertYM2608ToYM2610B();
		if (cli.ssgAttenuation) {
			vgm.attenuateSSG(-cli.ssgAttenuation);
		}
		vgm.optimize();
		await writeFile(cli.outputPath, vgm.write());
	} else {
		throw new Error(`Unknown chip: ${chip}`);
	}
}

class CLI {
	constructor() {
		this.ssgAttenuation = 0;
		this.chip = null;
		this.inputPath = null;
		this.outputPath = null;
	}

	parse(argv) {
		for (let i = 2; i < argv.length; i++) {
			const arg = argv[i];
			if (arg[0] == "-") {
				if (arg == "-sa") {
					this.ssgAttenuation = Number(argv[++i]);
					if (isNaN(this.ssgAttenuation))
						throw new Error("Invalid argument.");
				}
			} else if (!this.chip) {
				this.chip = arg;
			} else if (!this.inputPath) {
				this.inputPath = arg;
			} else if (!this.outputPath) {
				this.outputPath = arg;
			} else {
				throw new Error("Too many arguments.");
			}
		}
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
