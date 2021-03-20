import { ym2608Rhythm } from "./ym2608rhythm.js";

export class YM2608 {
	constructor(frequency) {
		this.frequency = frequency;
		this.registers = new Array(0x200).fill(0);
		this.memory = new Array(0x40000).fill(0);
		this.memoryAddress = 0;
		this.rhythm = ym2608Rhythm;
	}

	getRegister(address) {
		return this.registers[address];
	}

	setRegister(address, value) {
		this.registers[address] = value;
		switch (address) {
			case 0x102:
			case 0x103:
				this.memoryAddress = this.getMemoryStart();
			case 0x108:
				if ((this.registers[0x100] & 0xE0) == 0x60) {
					this.memory[this.memoryAddress++] = value;
				}
		}
	}

	getMemoryStart() {
		const shift = (this.registers[0x101] & 0x03) == 0x00 ? 2 : 5;
		return (this.registers[0x103] << 8 | this.registers[0x102]) << shift;
	}

	getMemoryEnd() {
		const shift = (this.registers[0x101] & 0x03) == 0x00 ? 2 : 5;
		return (this.registers[0x105] << 8 | this.registers[0x104]) + 1 << shift;
	}

	getMemorySlice(start, end) {
		return this.memory.slice(start, end);
	}

	setMemory(address, value) {
		this.memory[address] = value;
	}
}
