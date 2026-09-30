import {useLayoutEffect, useRef, type ReactNode} from 'react';
import {Box, measureElement, type DOMElement} from 'ink';

interface Props {
	/** Rows scrolled past at the top. */
	top: number;
	/** Reports the content height after every layout. */
	onMeasure: (height: number) => void;
	children: ReactNode;
}

/** Content taller than its panel, shifted up by `top`; the panel clips the rest. */
export function ScrollBox({top, onMeasure, children}: Props) {
	const ref = useRef<DOMElement>(null);
	useLayoutEffect(() => {
		if (ref.current) onMeasure(measureElement(ref.current).height);
	});
	return (
		<Box ref={ref} flexDirection="column" flexShrink={0} marginTop={-top}>
			{children}
		</Box>
	);
}
