/* eslint-disable @typescript-eslint/no-explicit-any */
// scripts/generateSiteMap.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import * as process from 'process';

// Import routes with CJS/ESM interop (works whether the module exports named or default)
import * as routesModule from '../../shared/constants/routes.constants.js';
const CLIENT_ROUTES: any =
	(routesModule as any).CLIENT_ROUTES ??
	(routesModule as any).default?.CLIENT_ROUTES ??
	(routesModule as any).default ??
	routesModule;

// ====== CONFIG ======
const BASE_URL = 'https://www.erica.co.il'; // <- change if needed
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'sitemap.xml');

// Treat these as non-indexable (add more as needed)
const EXCLUDED_PREFIXES = [
	CLIENT_ROUTES.AUTH,
	CLIENT_ROUTES.ADMIN.BASE,
	CLIENT_ROUTES.VERIFY_EMAIL,
	CLIENT_ROUTES.FORGOT_PASSWORD,
	CLIENT_ROUTES.RESET_PASSWORD,
	CLIENT_ROUTES.CHECKOUT,
	CLIENT_ROUTES.CART,
	CLIENT_ROUTES.REGISTER,
];

const DEFAULT_CHANGEFREQ = 'daily';
const DEFAULT_PRIORITY = 0.7;

// ====== HELPERS ======
function isParamRoute(routeStr: string) {
	return typeof routeStr === 'string' && routeStr.includes(':');
}

function isExcluded(routeStr: string) {
	return EXCLUDED_PREFIXES.some((p) => routeStr.startsWith(p));
}

/**
 * Join a parent prefix with a child segment in a URL-safe way
 * Examples:
 *  joinUrl('/products', '/recommended') -> '/products/recommended'
 *  joinUrl('', '/register') -> '/register'
 *  joinUrl('/admin', '/products') -> '/admin/products'
 */
function joinUrl(prefix: string, seg: string) {
	const a = (prefix || '').replace(/\/+$/g, '');
	const b = (seg || '').replace(/^\/+/g, '');
	if (!a && !b) return '/';
	if (!a) return `/${b}`;
	if (!b) return a || '/';
	return `${a}/${b}`;
}

/**
 * Recursively collect indexable routes from a nested routes object.
 * - If the object has BASE, it becomes/extends the current prefix and is included (if indexable)
 * - String children become pages under the current prefix
 * - Objects recurse with the same (already extended) prefix
 */
function collectRoutes(
	obj: Record<string, any>,
	prefix = '',
	out: string[] = []
) {
	// If this level has BASE, include it and extend the prefix
	if (typeof obj.BASE === 'string') {
		const baseFull = joinUrl(prefix, obj.BASE);
		if (!isParamRoute(baseFull) && !isExcluded(baseFull)) {
			out.push(baseFull);
		}
		prefix = baseFull;
	}

	for (const [key, val] of Object.entries(obj)) {
		if (key === 'BASE') continue; // already processed

		if (typeof val === 'string') {
			const full = joinUrl(prefix, val);
			if (!isParamRoute(full) && !isExcluded(full)) {
				out.push(full);
			}
		} else if (val && typeof val === 'object') {
			collectRoutes(val as Record<string, any>, prefix, out);
		}
	}

	return out;
}

function unique<T>(arr: T[]) {
	return Array.from(new Set(arr));
}

function xmlEscape(s: string) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function formatDateYYYYMMDD(date = new Date()) {
	return date.toISOString().split('T')[0];
}

function buildUrlXml({
	loc,
	lastmod,
	changefreq = DEFAULT_CHANGEFREQ,
	priority = DEFAULT_PRIORITY,
}: {
	loc: string;
	lastmod?: string;
	changefreq?: string;
	priority?: number;
}) {
	const L = xmlEscape(loc);
	const LM = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : '';
	const CF = changefreq
		? `<changefreq>${xmlEscape(changefreq)}</changefreq>`
		: '';
	const PR =
		priority || priority === 0
			? `<priority>${priority.toFixed(1)}</priority>`
			: '';
	return `  <url>
    <loc>${L}</loc>
${LM ? '    ' + LM + '\n' : ''}${CF ? '    ' + CF + '\n' : ''}${
		PR ? '    ' + PR + '\n' : ''
	}  </url>`;
}

// ====== DYNAMIC SOURCES (optional; placeholders) ======
// Add your Mongo/API fetchers and return arrays like:
//   { productPaths: { path: '/product/some-slug', lastmod?: 'YYYY-MM-DD' }[],
//     categoryPaths: { path: '/category/some-slug', lastmod?: 'YYYY-MM-DD' }[] }

async function fetchDynamicPathsFallback() {
	return {
		productPaths: [] as { path: string; lastmod?: string }[],
		categoryPaths: [] as { path: string; lastmod?: string }[],
	};
}

// ====== MAIN ======
async function main() {
	// 1) Collect static, indexable routes
	const staticPaths = unique(
		collectRoutes(CLIENT_ROUTES)
			// ensure "/" is first, and avoid duplicates
			.sort((a, b) =>
				a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)
			)
	);

	// 2) Dynamic paths (plug your DB/API here if needed)
	const { productPaths, categoryPaths } = await fetchDynamicPathsFallback();

	// 3) Build XML
	const today = formatDateYYYYMMDD();
	const urls: string[] = [];

	// Static pages (give home higher priority)
	for (const p of staticPaths) {
		const loc = `${BASE_URL}${p === '/' ? '' : p}`;
		const priority = p === '/' ? 1.0 : DEFAULT_PRIORITY;
		urls.push(
			buildUrlXml({
				loc,
				lastmod: today,
				changefreq: DEFAULT_CHANGEFREQ,
				priority,
			})
		);
	}

	// Dynamic product pages
	for (const item of productPaths) {
		const loc = `${BASE_URL}${item.path}`;
		urls.push(
			buildUrlXml({
				loc,
				lastmod: item.lastmod || today,
				changefreq: 'weekly',
				priority: 0.8,
			})
		);
	}

	// Dynamic category pages
	for (const item of categoryPaths) {
		const loc = `${BASE_URL}${item.path}`;
		urls.push(
			buildUrlXml({
				loc,
				lastmod: item.lastmod || today,
				changefreq: 'weekly',
				priority: 0.7,
			})
		);
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

	// 4) Ensure public/ exists and write file
	await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	await fs.writeFile(OUTPUT_PATH, xml, 'utf8');

	console.log(`✅ Sitemap written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
	console.error('❌ Failed to generate sitemap:', err);
	process.exit(1);
});
