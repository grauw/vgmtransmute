import { ym2608Rhythm } from "./ym2608rhythm.js";
import { ADPCM } from "./adpcm.js";

function assertArrayEquals(array1, array2) {
	if (array1.length != array2.length)
		throw new Error(`Assertion failed: length mismatch ${array1.length} != ${array2.length}`);
	for (let i = 0; i < array1.length; i++) {
		if (array1[i] != array2[i])
			throw new Error(`Assertion failed: ${array1[i]} != ${array2[i]} at index ${i}`);
	}
}

function test() {
	for (const inputCodes of ym2608Rhythm) {
		const sample = ADPCM.decode(inputCodes);
		const outputCodes = ADPCM.encode(sample);
		assertArrayEquals(inputCodes, outputCodes);
	}
}

test();
