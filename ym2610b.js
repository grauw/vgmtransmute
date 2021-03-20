import { YM2608 } from "./ym2608.js";
import { ADPCM } from "./adpcm.js";
import { clamp } from "./utils.js";

class Command {
}

class LoopCommand extends Command {
}

class WaitCommand extends Command {
	constructor(length) {
		super();
		if (length < 0)
			throw new Error("Wait must be positive.");
		this.length = length;
	}
}

class YM2610Command extends Command {
	constructor(register, value) {
		super();
		this.register = register;
		this.value = value;
	}
}

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

export class YM2610VGM {
	constructor() {
		this.frequency = 0;
		this.commands = [];
		this.adpcmA = new YM2610ADPCM();
		this.adpcmB = new YM2610ADPCM();
		this.gd3 = [];
	}

	addCommand(command) {
		this.commands.push(command);
	}

	read(input) {
		const getByte = address => input[address];
		const getWord = address => getByte(address) | getByte(address + 1) << 8;
		const getDoubleWord = address => getWord(address) | getWord(address + 2) << 16;
		if (getDoubleWord(0x00) != 0x206d6756)
			throw new Error("Not a VGM file.");
		const version = getDoubleWord(0x08);
		const gd3 = getDoubleWord(0x14) ? getDoubleWord(0x14) + 0x14 : 0;
		const loop = getDoubleWord(0x1C) ? getDoubleWord(0x1C) + 0x1C : 0;
		const headerSize = version >= 0x150 ? getDoubleWord(0x34) + 0x34 : 0x40;
		this.frequency = version >= 0x151 && headerSize >= 0x4C ? getDoubleWord(0x48) & 0x3FFFFFFF : 0;

		if (!this.frequency)
			throw new Error("Not an YM2608 VGM.");

		if (gd3) {
			for (let i = gd3; i < input.length; i++) {
				this.gd3.push(input[i]);
			}
		}

		const ym2608 = new YM2608(this.frequency);

		for (let i = 0; i < ym2608.rhythm.length; i++) {
			const sampleData = i < 4 ? ym2608.rhythm[i] : ADPCM.encode2x(ADPCM.decode(ym2608.rhythm[i]));
			const sample = this.adpcmA.addSampleData(sampleData);
			this.addCommand(new YM2610Command(0x110 + i, (sample.start >> 8) & 0xFF));
			this.addCommand(new YM2610Command(0x118 + i, (sample.start >> 16) & 0xFF));
			this.addCommand(new YM2610Command(0x120 + i, (sample.end - 1 >> 8) & 0xFF));
			this.addCommand(new YM2610Command(0x128 + i, (sample.end - 1 >> 16) & 0xFF));
		}

		let address = headerSize;
		const readByte = () => input[address++];
		const readWord = () => readByte() | readByte() << 8;
		const readDoubleWord = () => readWord() | readWord() << 16;

		const adpcmMap = new Map();
		while (address < input.length) {
			if (address == loop)
				this.addCommand(new LoopCommand());
			const type = readByte();
			if (type == 0x56 || type == 0x57) {
				const register = (type & 1) << 8 | readByte();
				const value = readByte();
				if (register >= 0x000 && register < 0x010) {
					this.addCommand(new YM2610Command(register, value));
				} else if (register >= 0x010 && register < 0x020) {
					this.addCommand(new YM2610Command(register + 0xF0, value));
				} else if (register >= 0x020 && register < 0x100) {
					this.addCommand(new YM2610Command(register, value));
				} else if (register >= 0x100 && register < 0x10C) {
					if (register == 0x100 && (value & 0xE0) == 0xA0) {
						const start = ym2608.getMemoryStart();
						const end = ym2608.getMemoryEnd();
						const hash = end << 18 | start;
						if (!adpcmMap.has(hash)) {
							const sample = this.adpcmB.addSampleData(ym2608.getMemorySlice(start, end));
							adpcmMap.set(hash, sample);
						}
						const sample = adpcmMap.get(hash);
						this.addCommand(new YM2610Command(0x012, (sample.start >> 8) & 0xFF));
						this.addCommand(new YM2610Command(0x013, (sample.start >> 16) & 0xFF));
						this.addCommand(new YM2610Command(0x014, ((sample.end - 1) >> 8) & 0xFF));
						this.addCommand(new YM2610Command(0x015, ((sample.end - 1) >> 16) & 0xFF));
					}
					if (register < 0x102 || register >= 0x109) {
						this.addCommand(new YM2610Command(register - 0xF0, value));
					}
				} else if (register >= 0x130 && register < 0x200) {
					this.addCommand(new YM2610Command(register, value));
				}
				ym2608.setRegister(register, value);
			} else if (type == 0x61) {
				this.addCommand(new WaitCommand(readWord()));
			} else if (type == 0x62) {
				this.addCommand(new WaitCommand(735));
			} else if (type == 0x63) {
				this.addCommand(new WaitCommand(882));
			} else if (type == 0x66) {
				break;
			} else if (type == 0x67) {
				if (readByte() != 0x66)
					throw new Error("Expected 0x67 to be followed by 0x66.");
				if (readByte() != 0x81)
					throw new Error("Expected YM2608 DELTA-T ROM data.");
				const size = readDoubleWord() - 8;
				const romSize = readDoubleWord();
				const startAddress = readDoubleWord();
				for (let address = startAddress; address < startAddress + size; address++) {
					ym2608.setMemory(address, readByte());
				}
			} else if (type >= 0x70 && type < 0x80) {
				this.addCommand(new WaitCommand((type & 15) + 1));
			} else {
				throw new Error(`Unsupported command ${type.toString(16)} at address ${(address - 1).toString(16)}`);
			}
		}
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

	write() {
		const output = [];
		const setByte = (address, value) => output[address] = value;
		const setWord = (address, value) => setByte(address, value) | setByte(address + 1, value >> 8);
		const setDoubleWord = (address, value) => setWord(address, value) | setWord(address + 2, value >> 16);
		const writeByte = value => { output.push(value & 0xFF); };
		const writeWord = value => { writeByte(value); writeByte(value >> 8); };
		const writeDoubleWord = value => { writeWord(value); writeWord(value >> 16); };
		const writeByteArray = values => { for (const value of values) writeByte(value); };

		writeDoubleWord(0x206d6756);  // "Vgm " ident
		writeDoubleWord(0);  // EOF offset
		writeDoubleWord(0x151);  // Version
		writeDoubleWord(0);  // SN76489 clock
		writeDoubleWord(0);  // YM2413 clock
		writeDoubleWord(0);  // GD3 offset
		writeDoubleWord(0);  // Total # samples
		writeDoubleWord(0);  // Loop offset
		writeDoubleWord(0);  // Loop # samples
		writeDoubleWord(0);  // Rate
		writeDoubleWord(0);  // SN FB / SNW / SF
		writeDoubleWord(0);  // YM2612 clock
		writeDoubleWord(0);  // YM2151 clock
		writeDoubleWord(0x1C);  // VGM data offset
		writeDoubleWord(0);  // Sega PCM clock
		writeDoubleWord(0);  // SPCM Interface
		writeDoubleWord(0);  // RF5C68 clock
		writeDoubleWord(0);  // YM2203 clock
		writeDoubleWord(0);  // YM2608 clock
		writeDoubleWord(this.frequency | 0x80000000);  // YM2610/B clock

		if (this.adpcmA.data.length) {
			writeByte(0x67);
			writeByte(0x66);
			writeByte(0x82);
			writeDoubleWord(this.adpcmA.data.length + 8);
			writeDoubleWord(0x1000000);
			writeDoubleWord(0);
			writeByteArray(this.adpcmA.data);
		}

		if (this.adpcmB.data.length) {
			writeByte(0x67);
			writeByte(0x66);
			writeByte(0x83);
			writeDoubleWord(this.adpcmB.data.length + 8);
			writeDoubleWord(0x1000000);
			writeDoubleWord(0);
			writeByteArray(this.adpcmB.data);
		}

		let loopOffset = 0;
		let loopSamples = 0;
		let totalSamples = 0;
		for (const command of this.commands) {
			if (command instanceof YM2610Command) {
				writeByte(0x58 | command.register >> 8);
				writeByte(command.register & 0xFF);
				writeByte(command.value);
			} else if (command instanceof WaitCommand && command.length > 0) {
				if (command.length <= 16) {
					writeByte(0x70 + command.length - 1);
				} else {
					writeByte(0x61);
					writeWord(command.length);
				}
				totalSamples += command.length;
			} else if (command instanceof LoopCommand) {
				loopOffset = output.length;
				loopSamples = totalSamples;
			}
		}
		writeByte(0x66);

		if (this.gd3.length) {
			setDoubleWord(0x14, output.length - 0x14);
			for (const value of this.gd3) {
				writeByte(value);
			}
		}

		setDoubleWord(0x04, output.length - 0x04);
		setDoubleWord(0x18, totalSamples);
		if (loopOffset) {
			setDoubleWord(0x1C, loopOffset - 0x1C);
			setDoubleWord(0x20, totalSamples - loopSamples);
		}

		return Buffer.from(output);
	}
}
