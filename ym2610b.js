import { VGM, YM2610Command, YM2608Command, DataBlockCommand } from "./vgm.js";
import { YM2608 } from "./ym2608.js";
import { ADPCM } from "./adpcm.js";
import { clamp } from "./utils.js";

class YM2610ADPCM {
	constructor() {
		this.data = [];
		this.samples = [];
	}

	addSampleData(data) {
		const start = this.data.length;
		for (const value of data) {
			this.data.push(value);
		}
		while ((this.data.length & 0xFF) != 0) {
			this.data.push(0x08);
			// TODO: Go back to 0 rather than hold, to fix RIM
		}
		const end = this.data.length;
		const sample = new YM2610ADPCMSample(this, start, end);
		this.samples.push(sample);
		return sample;
	}

	getSample(start, end) {
		for (const sample of this.samples) {
			if (sample.start == start && sample.end == end) {
				return sample;
			}
		}
		return null;
	}
}

class YM2610ADPCMSample {
	constructor(adpcm, start, end) {
		this.adpcm = adpcm;
		this.start = start;
		this.end = end;
	}
}

export class YM2610VGM extends VGM {
	convertYM2608ToYM2610B() {
		if (!this.ym2608Frequency)
			throw new Error("Not an YM2608 VGM.");

		const ym2608 = new YM2608(this.ym2608Frequency);
		const adpcmA = new YM2610ADPCM();
		const adpcmB = new YM2610ADPCM();
		const commands = [];

		for (let i = 0; i < ym2608.rhythm.length; i++) {
			const sampleData = i < 4 ? ym2608.rhythm[i] : ADPCM.encode2x(ADPCM.decode(ym2608.rhythm[i]));
			const sample = adpcmA.addSampleData(sampleData);
			commands.push(new YM2610Command(0x110 + i, (sample.start >> 8) & 0xFF));
			commands.push(new YM2610Command(0x118 + i, (sample.start >> 16) & 0xFF));
			commands.push(new YM2610Command(0x120 + i, (sample.end - 1 >> 8) & 0xFF));
			commands.push(new YM2610Command(0x128 + i, (sample.end - 1 >> 16) & 0xFF));
		}

		const adpcmMap = new Map();
		for (const command of this.commands) {
			if (command instanceof YM2608Command) {
				const { register, value } = command;
				if (register >= 0x000 && register < 0x010) {
					commands.push(new YM2610Command(register, value));
				} else if (register >= 0x010 && register < 0x020) {
					commands.push(new YM2610Command(register + 0xF0, value));
				} else if (register >= 0x020 && register < 0x100) {
					commands.push(new YM2610Command(register, value));
				} else if (register >= 0x100 && register < 0x10C) {
					if (register == 0x100 && (value & 0xE0) == 0xA0) {
						const start = ym2608.getMemoryStart();
						const end = ym2608.getMemoryEnd();
						const hash = end << 18 | start;
						if (!adpcmMap.has(hash)) {
							const sample = adpcmB.addSampleData(ym2608.getMemorySlice(start, end));
							adpcmMap.set(hash, sample);
						}
						const sample = adpcmMap.get(hash);
						commands.push(new YM2610Command(0x012, (sample.start >> 8) & 0xFF));
						commands.push(new YM2610Command(0x013, (sample.start >> 16) & 0xFF));
						commands.push(new YM2610Command(0x014, ((sample.end - 1) >> 8) & 0xFF));
						commands.push(new YM2610Command(0x015, ((sample.end - 1) >> 16) & 0xFF));
					}
					if (register < 0x102 || register >= 0x109) {
						commands.push(new YM2610Command(register - 0xF0, value));
					}
				} else if (register >= 0x130 && register < 0x200) {
					commands.push(new YM2610Command(register, value));
				}
				ym2608.setRegister(register, value);
			} else if (command instanceof DataBlockCommand && command.type == 0x81) {
				const size = command.data.length;
				const startAddress = command.getROMStartAddress();
				for (let i = 8; i < size; i++) {
					ym2608.setMemory(startAddress + i - 8, command.data[i]);
				}
			} else {
				commands.push(command);
			}
		}

		if (adpcmA.data.length) {
			const dataBlock = new DataBlockCommand(0x82);
			dataBlock.setROMData(0x1000000, 0, adpcmA.data);
			commands.unshift(dataBlock);
		}
		if (adpcmB.data.length) {
			const dataBlock = new DataBlockCommand(0x83);
			dataBlock.setROMData(0x1000000, 0, adpcmB.data);
			commands.unshift(dataBlock);
		}

		this.ym2610Frequency = this.ym2608Frequency | 0x80000000;  // YM2610B flag
		this.ym2608Frequency = 0;

		this.commands = commands;
	}

	attenuateSSG(dB) {
		const commands = [];
		for (const command of this.commands) {
			if (command instanceof YM2610Command) {
				const { register, value } = command;
				if (register >= 0x008 && register < 0x00B && value < 0x10) {
					commands.push(new YM2610Command(register, clamp(Math.round(value + dB / 3), 0, 15)));
				} else {
					commands.push(command);
				}
			} else {
				commands.push(command);
			}
		}
		this.commands = commands;
	}

	optimize() {
		const commands = [];
		const ym2610regs = new Array(512).fill(-1);
		for (const command of this.commands) {
			if (command instanceof YM2610Command) {
				const { register, value } = command;
				if (ym2610regs[register] != value || register < 0x012 || register > 0x015) {
					commands.push(command);
				}
				ym2610regs[register] = value;
			} else {
				commands.push(command);
			}
		}
		this.commands = commands;
	}
}
