import type { TOptions } from 'i18next';
import { useTranslation } from 'react-i18next';
import en from '../locale/en.json';
import he from '../locale/he.json';

type Flatten<T, P extends string = ''> = {
	[K in keyof T]: T[K] extends string
		? `${P}${K & string}`
		: Flatten<T[K], `${P}${K & string}.`>;
}[keyof T];

type TranslationKeysHE = Flatten<typeof he>;
type TranslationKeysEN = Flatten<typeof en>;

export type TranslationKeys = TranslationKeysHE | TranslationKeysEN;

// Recursively get all dot prefixes from keys
type PrefixesOf<K extends string> = K extends `${infer Head}.${infer Tail}`
	? Head | `${Head}.${PrefixesOf<Tail>}`
	: never;

// Include root (empty string) in valid prefixes
type AllValidKeyPrefixes =
	| ''
	| (TranslationKeys extends infer T extends string ? PrefixesOf<T> : never);

// If prefix is '', return all keys; otherwise, filter
type ScopedKeys<
	AllKeys extends string,
	Prefix extends string
> = Prefix extends ''
	? AllKeys
	: AllKeys extends `${Prefix}.${infer Rest}`
	? Rest
	: never;

export function useLocale<Prefix extends AllValidKeyPrefixes>(prefix: Prefix) {
	const { t: rawT } = useTranslation();

	type SubKey = ScopedKeys<TranslationKeys, Prefix>;

	const t = <K extends SubKey>(key: K, options?: TOptions): string => {
		return prefix
			? rawT(`${prefix}.${key}` as string, options)
			: rawT(key, options);
	};

	return { t };
}
