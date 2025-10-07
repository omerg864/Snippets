import { useEffect, useState } from 'react';

const breakpoints = {
	base: 0,
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	'2xl': 1536,
} as const;

type Breakpoint = keyof typeof breakpoints;

const orderedBreakpoints: Breakpoint[] = [
	'base',
	'sm',
	'md',
	'lg',
	'xl',
	'2xl',
];

function getCurrentBreakpoint(width: number): Breakpoint {
	for (let i = orderedBreakpoints.length - 1; i >= 0; i--) {
		const key = orderedBreakpoints[i];
		if (width >= breakpoints[key]) return key;
	}
	return 'base';
}

export function useBreakpoint() {
	const [breakpoint, setBreakpoint] = useState<Breakpoint>(
		getCurrentBreakpoint(window.innerWidth)
	);

	useEffect(() => {
		const handleResize = () => {
			setBreakpoint(getCurrentBreakpoint(window.innerWidth));
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	const index = orderedBreakpoints.indexOf(breakpoint);

	const is = (bp: Breakpoint) => breakpoint === bp;
	const isSmallerThan = (bp: Breakpoint) =>
		index < orderedBreakpoints.indexOf(bp);
	const isLargerThan = (bp: Breakpoint) =>
		index > orderedBreakpoints.indexOf(bp);
	const isOrSmallerThan = (bp: Breakpoint) =>
		index <= orderedBreakpoints.indexOf(bp);
	const isOrLargerThan = (bp: Breakpoint) =>
		index >= orderedBreakpoints.indexOf(bp);

	return {
		breakpoint,
		isBase: is('base'),
		isSm: is('sm'),
		isMd: is('md'),
		isLg: is('lg'),
		isXl: is('xl'),
		is2xl: is('2xl'),
		isSmallerThan,
		isLargerThan,
		isOrSmallerThan,
		isOrLargerThan,
	};
}
