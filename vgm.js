export class VGM {
	constructor() {
		this.header = [];
		this.commands = [];
		this.gd3 = [];
		this.ym2608Frequency = 0;
		this.ym2610Frequency = 0;
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
		this.ym2608Frequency = version >= 0x151 && headerSize >= 0x4C ? getDoubleWord(0x48) & 0x3FFFFFFF : 0;
		this.ym2610Frequency = version >= 0x151 && headerSize >= 0x50 ? getDoubleWord(0x4C) & 0x3FFFFFFF : 0;

		if (gd3) {
			for (let i = gd3; i < input.length; i++) {
				this.gd3.push(input[i]);
			}
		}

		let address = headerSize;
		const readByte = () => input[address++];
		const readWord = () => readByte() | readByte() << 8;
		const readDoubleWord = () => readWord() | readWord() << 16;

		while (address < input.length) {
			if (address == loop)
				this.addCommand(new LoopCommand());
			const type = readByte();
			if (type == 0x56 || type == 0x57) {
				this.addCommand(new YM2608Command((type & 1) << 8 | readByte(), readByte()));
			} else if (type == 0x58 || type == 0x59) {
				this.addCommand(new YM2610Command((type & 1) << 8 | readByte(), readByte()));
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
				const dataType = readByte();
				const size = readDoubleWord();
				const data = [];
				for (let i = 0; i < size; i++) {
					data.push(readByte());
				}
				this.addCommand(new DataBlockCommand(dataType, data));
			} else if (type >= 0x70 && type < 0x80) {
				this.addCommand(new WaitCommand((type & 15) + 1));
			} else if (type == 0x90) {
				this.addCommand(new StreamSetup(readByte(), readByte(), readByte(), readByte()));
			} else if (type == 0x91) {
				this.addCommand(new StreamSetData(readByte(), readByte(), readByte(), readByte()));
			} else if (type == 0x92) {
				this.addCommand(new StreamSetFrequency(readByte(), readDoubleWord()));
			} else if (type == 0x93) {
				this.addCommand(new StreamStart(readByte(), readDoubleWord(), readByte(), readDoubleWord()));
			} else if (type == 0x94) {
				this.addCommand(new StreamStop(readByte()));
			} else if (type == 0x95) {
				this.addCommand(new StreamStartFast(readByte(), readWord(), readByte()));
			} else {
				throw new Error(`Unsupported command ${type.toString(16)} at address ${(address - 1).toString(16)}`);
			}
		}
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
		writeDoubleWord(this.ym2608Frequency);  // YM2608 clock
		writeDoubleWord(this.ym2610Frequency);  // YM2610/B clock

		let loopOffset = 0;
		let loopSamples = 0;
		let totalSamples = 0;
		for (const command of this.commands) {
			if (command instanceof YM2608Command) {
				writeByte(0x56 | command.register >> 8);
				writeByte(command.register & 0xFF);
				writeByte(command.value);
			} else if (command instanceof YM2610Command) {
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
			} else if (command instanceof DataBlockCommand) {
				if (command.data.length) {
					writeByte(0x67);
					writeByte(0x66);
					writeByte(command.type);
					writeDoubleWord(command.data.length);
					writeByteArray(command.data);
				}
			} else if (command instanceof LoopCommand) {
				loopOffset = output.length;
				loopSamples = totalSamples;
			} else if (command instanceof StreamSetup) {
				writeByte(0x90);
				writeByte(command.streamId);
				writeByte(command.chipType);
				writeByte(command.port);
				writeByte(command.register);
			} else if (command instanceof StreamSetData) {
				writeByte(0x91);
				writeByte(command.streamId);
				writeByte(command.dataBankId);
				writeByte(command.stepSize);
				writeByte(command.stepBase);
			} else if (command instanceof StreamSetFrequency) {
				writeByte(0x92);
				writeByte(command.streamId);
				writeDoubleWord(command.frequency);
			} else if (command instanceof StreamStart) {
				writeByte(0x93);
				writeByte(command.streamId);
				writeDoubleWord(command.dataStart);
				writeByte(command.lengthMode);
				writeDoubleWord(command.dataLength);
			} else if (command instanceof StreamStop) {
				writeByte(0x94);
				writeByte(command.streamId);
			} else if (command instanceof StreamStartFast) {
				writeByte(0x95);
				writeByte(command.streamId);
				writeWord(command.blockId);
				writeByte(command.flags);
			} else {
				throw new Error("Unsupported command.");
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

export class Command {
}

export class LoopCommand extends Command {
}

export class WaitCommand extends Command {
	constructor(length) {
		super();
		if (length < 0)
			throw new Error("Wait must be positive.");
		this.length = length;
	}
}

export class DataBlockCommand extends Command {
	constructor(type, data = []) {
		super();
		this.type = type;
		this.data = data;
	}

	getROMSize() {
		if (this.type < 0x80 || this.type >= 0xC0)
			throw new Error("Not a ROM/RAM image data block.");
		return this.data[3] << 24 | this.data[2] << 16 | this.data[1] << 8 | this.data[0];
	}

	getROMStartAddress() {
		if (this.type < 0x80 || this.type >= 0xC0)
			throw new Error("Not a ROM/RAM image data block.");
		return this.data[7] << 24 | this.data[6] << 16 | this.data[5] << 8 | this.data[4];
	}

	getROMData(address) {
		if (this.type < 0x80 || this.type >= 0xC0)
			throw new Error("Not a ROM/RAM image data block.");
		return this.data[address + 8];
	}

	setROMData(romSize, startAddress, data) {
		if (this.type < 0x80 || this.type >= 0xC0)
			throw new Error("Not a ROM/RAM image data block.");
		this.data[0] = romSize & 0xFF;
		this.data[1] = (romSize >> 8) & 0xFF;
		this.data[2] = (romSize >> 16) & 0xFF;
		this.data[3] = (romSize >> 24) & 0xFF;
		this.data[4] = startAddress & 0xFF;
		this.data[5] = (startAddress >> 8) & 0xFF;
		this.data[6] = (startAddress >> 16) & 0xFF;
		this.data[7] = (startAddress >> 24) & 0xFF;
		for (let i = 0; i < data.length; i++) {
			this.data[i + 8] = data[i];
		}
	}
}

export class StreamSetup extends Command {
	constructor(streamId, chipType, port, register) {
		super();
		this.streamId = streamId;
		this.chipType = chipType;
		this.port = port;
		this.register = register;
	}
}

export class StreamSetData extends Command {
	constructor(streamId, dataBankId, stepSize, stepBase) {
		super();
		this.streamId = streamId;
		this.dataBankId = dataBankId;
		this.stepSize = stepSize;
		this.stepBase = stepBase;
	}
}

export class StreamSetFrequency extends Command {
	constructor(streamId, frequency) {
		super();
		this.streamId = streamId;
		this.frequency = frequency;
	}
}

export class StreamStart extends Command {
	constructor(streamId, dataStart, lengthMode, dataLength) {
		super();
		this.streamId = streamId;
		this.dataStart = dataStart;
		this.lengthMode = lengthMode;
		this.dataLength = dataLength;
	}
}

export class StreamStop extends Command {
	constructor(streamId) {
		super();
		this.streamId = streamId;
	}
}

export class StreamStartFast extends Command {
	constructor(streamId, blockId, flags) {
		super();
		this.streamId = streamId;
		this.blockId = blockId;
		this.flags = flags;
	}
}

export class YM2608Command extends Command {
	constructor(register, value) {
		super();
		this.register = register;
		this.value = value;
	}
}

export class YM2610Command extends Command {
	constructor(register, value) {
		super();
		this.register = register;
		this.value = value;
	}
}
