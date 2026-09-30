import {useEffect, useState} from 'react';
import {useStdout} from 'ink';

/** Current terminal width in columns, updated when the window is resized. */
export function useTerminalWidth(): number {
	const {stdout} = useStdout();
	const [width, setWidth] = useState(stdout.columns || 80);

	useEffect(() => {
		const onResize = () => setWidth(stdout.columns || 80);
		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	return width;
}

/** Shortens text to fit `max` columns by cutting out the middle. */
export function truncateMiddle(text: string, max: number): string {
	if (text.length <= max) return text;
	if (max <= 1) return '…'.slice(0, max);
	const head = Math.ceil((max - 1) / 2);
	const tail = Math.floor((max - 1) / 2);
	return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}
