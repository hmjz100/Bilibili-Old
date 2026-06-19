/**
 * @file av号工具
 */

export namespace AV {
	const XOR_CODE = 23442827791579;
	const MASK_CODE = 2251799813685247;

	const MAX_AID = 1 << 51;
	const MIN_AID = 1;

	const BASE = 58;
	const BYTES = ['B', 'V', 1, '', '', '', '', '', '', '', '', ''];
	const BV_LEN = BYTES.length;

	const ALPHABET = [
		'F', 'c', 'w', 'A', 'P', 'N', 'K', 'T', 'M', 'u', 'g', '3', 'G', 'V', '5', 'L',
		'j', '7', 'E', 'J', 'n', 'H', 'p', 'W', 's', 'x', '4', 't', 'b', '8', 'h', 'a',
		'Y', 'e', 'v', 'i', 'q', 'B', 'z', '6', 'r', 'k', 'C', 'y', '1', '2', 'm', 'U',
		'S', 'D', 'Q', 'X', '9', 'R', 'd', 'o', 'Z', 'f'
	];
	const DIGIT_MAP = [0, 1, 2, 9, 7, 5, 6, 4, 8, 3, 10, 11];
	const REG_EXP = new RegExp(`^[bB][vV]1[${ALPHABET.join('')}]{9}$`, 'g');
	const REG_EXP_SHORT = new RegExp(`^1[${ALPHABET.join('')}]{9}$`, 'g');
	const REG_EXP_STR = new RegExp(`[bB][vV]1[${ALPHABET.join('')}]{9}`, 'g');

	/**
	 * 大整数按位与（避免 JavaScript 32位位运算限制）
	 */
	function bitwiseAnd(a: number, b: number): number {
		let result = 0;
		let bit = 1;
		while (a > 0 || b > 0) {
			if ((a & 1) === 1 && (b & 1) === 1) {
				result += bit;
			}
			a = Math.floor(a / 2);
			b = Math.floor(b / 2);
			bit *= 2;
		}
		return result;
	}

	/**
	 * 大整数按位异或（避免 JavaScript 32位位运算限制）
	 */
	function bitwiseXor(a: number, b: number): number {
		let result = 0;
		let bit = 1;
		while (a > 0 || b > 0) {
			if ((a & 1) !== (b & 1)) {
				result += bit;
			}
			a = Math.floor(a / 2);
			b = Math.floor(b / 2);
			bit *= 2;
		}
		return result;
	}

	/**
	 * aid => BV
	 * 
	 * @example
	 * toBV(170001) // BV17x411w7KC
	 */
	export function toBV(avid: number) {
		if (avid < MIN_AID) {
			throw new RangeError(`Av ${avid} is smaller than ${MIN_AID}`);
		}
		if (avid >= MAX_AID) {
			throw new RangeError(`Av ${avid} is bigger than ${MAX_AID}`);
		}

		const bytes = Array.from(BYTES);

		let bv_idx = BV_LEN - 1;
		let tmp = (MAX_AID | avid) ^ XOR_CODE;
		while (tmp !== 0) {
			let table_idx = tmp % BASE;
			bytes[DIGIT_MAP[bv_idx]] = ALPHABET[table_idx];
			tmp = Math.floor(tmp / BASE);
			bv_idx -= 1;
		}

		return bytes.join('');
	}

	/**
	 * BV => aid
	 * 
	 * @example
	 * fromBV('BV17x411w7KC') // 170001
	 * fromBV('17x411w7KC') // 170001
	 */
	export function fromBV(bvid: string) {
		if (REG_EXP_SHORT.test(bvid)) {
			bvid = 'BV' + bvid;
		}

		let r = 0;
		for (let i = 3; i < BV_LEN; i++) {
			r = r * BASE + ALPHABET.indexOf(bvid[DIGIT_MAP[i]]);
		}

		return `${bitwiseXor(bitwiseAnd(r, MASK_CODE), XOR_CODE)}`;
	}

	/**
	 * 替换文本中所有BV号
	 * 
	 * @param str 含有BV号的文本
	 * @returns 替换为av号的文本
	 * @example
	 * fromStr('***BV17x411w7KC***') // ***av170001***
	 */
	export function fromStr(str: string) {
		return str.replace(REG_EXP_STR, (s: string) => "av" + fromBV(s));
	}
}