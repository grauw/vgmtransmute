function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * DeltaT encoder / decoder
 * Yamaha YM2610 OPNB ADPCM-B
 * Yamaha YM2608 OPNA ADPCM
 * Yamaha Y8950 MSX-AUDIO ADPCM
 */
export class DeltaT {
	// TODO
}

/**
 * ADPCM encoder / decoder
 * Yamaha YM2610 OPNB ADPCM-A
 */
export class ADPCM {
	constructor(sample, stepIndex, code) {
		this.sample = 0;
		this.stepIndex = 0;
		this.decodingStep = 0;
	}

	static decode(codeBytes) {
		const codec = new ADPCM();
		const samples = [];
		for (const codeByte of codeBytes) {
			samples.push(codec.decode((codeByte >> 4) & 15));
			samples.push(codec.decode(codeByte & 15));
		}
		return samples;
	}

	static encode(samples) {
		if (samples.length % 2)
			throw new Error("Sample count must be even.");
		const codec = new ADPCM();
		const codeBytes = [];
		for (let i = 0; i < samples.length; i += 2) {
			const code1 = codec.encode(samples[i]);
			const code2 = codec.encode(samples[i + 1]);
			codeBytes.push(code1 << 4 | code2);
		}
		return codeBytes;
	}

	static encode2x(samples) {
		const codec = new ADPCM();
		const codeBytes = [];
		for (const sample of samples) {
			const code1 = codec.encode(sample);
			const code2 = codec.encode(sample);
			codeBytes.push(code1 << 4 | code2);
		}
		return codeBytes;
	}

	encode(sample) {
		let difference = sample - this.sample;
		let step = stepSize[this.stepIndex];
		let code = 0;
		if (difference < 0) {
			code |= 8;
			difference = -difference;
		}

		code |= Math.min(Math.floor((difference << 2) / step), 7);

		this.decode(code);
		return code;
	}

	decode(code) {
		let difference = (2 * (code & 7) + 1) * stepSize[this.stepIndex] >> 3;
		difference = code & 8 ? -difference : difference;

		let sample = this.sample + difference;
		if (sample & ~0x7FF) {
			sample |= ~0xFFF;
		}

		this.sample = sample;
		this.stepIndex = clamp(this.stepIndex + stepAdjust[code], 0, stepSize.length - 1);

		return sample;
	}
}

const stepSize = [
	16,  17,   19,   21,   23,   25,   28,
	31,  34,   37,   41,   45,   50,   55,
	60,  66,   73,   80,   88,   97,  107,
   118, 130,  143,  157,  173,  190,  209,
   230, 253,  279,  307,  337,  371,  408,
   449, 494,  544,  598,  658,  724,  796,
   876, 963, 1060, 1166, 1282, 1411, 1552
];

const stepAdjust = [
	-1, -1, -1, -1, 2, 5, 7, 9,
	-1, -1, -1, -1, 2, 5, 7, 9
];
