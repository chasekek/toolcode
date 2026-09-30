import {useEffect, useState} from 'react';
import {useStdout} from 'ink';

export interface TerminalSize {
	columns: number;
	rows: number;
}

/** Current terminal size in cells, updated when the window is resized. */
export function useTerminalSize(): TerminalSize {
	const {stdout} = useStdout();
	const read = (): TerminalSize => ({columns: stdout.columns || 80, rows: stdout.rows || 24});
	const [size, setSize] = useState(read);

	useEffect(() => {
		// Terminals reflow or crop the old frame when resized; start from a blank screen so no
		// stale rows survive around the new one.
		const onResize = () => {
			stdout.write('\x1b[2J\x1b[H');
			setSize(read());
		};
		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	return size;
}
