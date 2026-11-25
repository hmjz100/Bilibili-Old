/**
 * @file av号工具
 */

import JSBI from 'jsbi';

export namespace AV {
	/**
	 * 异或码，`2^51` 级别，远超 32 位。  
	 * 使用 [jsbi](https://github.com/GoogleChromeLabs/jsbi) 做大整数运算：  
	 * 构建目标为 es2015，原生 BigInt 字面量（`123n`）会令 esbuild 报错，故以 jsbi 替代。
	 */
	const XOR_CODE = JSBI.BigInt('23442827791579');
	/** 掩码，`2^51 - 1` */
	const MASK_CODE = JSBI.BigInt('2251799813685247');
	/** aid 上限，`2^51` */
	const MAX_AID = JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(51));
	const MIN_AID = JSBI.BigInt(1);

	const BASE = JSBI.BigInt(58);
	const ZERO = JSBI.BigInt(0);
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
	 * aid => BV
	 *
	 * @example
	 * toBV(170001) // BV17x411w7KC
	 */
	export function toBV(avid: number) {
		const aid = JSBI.BigInt(String(Math.trunc(avid)));
		if (JSBI.lessThan(aid, MIN_AID)) {
			throw new RangeError(`Av ${avid} is smaller than 1`);
		}
		if (JSBI.greaterThanOrEqual(aid, MAX_AID)) {
			throw new RangeError(`Av ${avid} is bigger than ${MAX_AID.toString()}`);
		}

		const bytes = Array.from(BYTES);

		let bv_idx = BV_LEN - 1;
		// 全程 jsbi：`|` 与 `^` 在 32 位下会截断 XOR_CODE，负数取模亦会错位
		let tmp = JSBI.bitwiseXor(JSBI.bitwiseOr(MAX_AID, aid), XOR_CODE);
		while (JSBI.notEqual(tmp, ZERO)) {
			// jsbi 实例的 valueOf() 会刻意抛错，必须用 Number(JSBI.toNumber(...)) 或先 toString
			bytes[DIGIT_MAP[bv_idx]] = ALPHABET[Number(JSBI.remainder(tmp, BASE).toString())];
			tmp = JSBI.divide(tmp, BASE);
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

		// 全程 jsbi：结果可达 2^51，32 位位运算会截断 MASK_CODE 与 XOR_CODE
		let r = ZERO;
		for (let i = 3; i < BV_LEN; i++) {
			r = JSBI.add(JSBI.multiply(r, BASE), JSBI.BigInt(String(ALPHABET.indexOf(bvid[DIGIT_MAP[i]]))));
		}

		return JSBI.bitwiseXor(JSBI.bitwiseAnd(r, MASK_CODE), XOR_CODE).toString();
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
